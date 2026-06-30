import datetime
from decimal import Decimal

from django.db import models

from cbs.models import CBSControlAccount, MonthlyPV

from .models import EVMMetric, Period, PeriodProgress


def compute_ev(progress: PeriodProgress) -> Decimal:
    """EV = (actual_qty / budget_qty) * budget. Cost-only WPs and zero-qty WPs earn 0."""
    wp = progress.work_package
    if wp.is_cost_activity or not wp.qty:
        return Decimal('0')
    return (progress.actual_qty / wp.qty) * wp.budget


def compute_evm_for_period(period) -> int:
    """Recompute EV on each PeriodProgress row and upsert EVMMetric per Control Account."""
    progress_rows = PeriodProgress.objects.filter(period=period).select_related(
        'work_package__control_account'
    )

    for progress in progress_rows:
        new_ev = compute_ev(progress)
        if progress.ev != new_ev:
            progress.ev = new_ev
            progress.save(update_fields=['ev'])

    ca_totals: dict[int, dict[str, Decimal]] = {}
    for progress in progress_rows:
        ca_id = progress.work_package.control_account_id
        totals = ca_totals.setdefault(ca_id, {'ev': Decimal('0'), 'ac': Decimal('0')})
        totals['ev'] += progress.ev
        totals['ac'] += progress.ac

    if not ca_totals:
        return 0

    control_accounts = CBSControlAccount.objects.filter(id__in=ca_totals.keys())
    period_month = datetime.date(period.year, period.month, 1)
    pv_by_ca = {
        pv.control_account_id: pv.pv_cumulative
        for pv in MonthlyPV.objects.filter(control_account__in=control_accounts, period=period_month)
    }

    previous_period = Period.objects.filter(
        project=period.project,
    ).filter(
        models.Q(year__lt=period.year) | (models.Q(year=period.year) & models.Q(month__lt=period.month))
    ).order_by('year', 'month').last()

    previous_by_ca = {}
    if previous_period:
        previous_by_ca = {
            m.control_account_id: m
            for m in EVMMetric.objects.filter(control_account__in=control_accounts, period=previous_period)
        }

    count = 0
    for ca in control_accounts:
        totals = ca_totals[ca.id]
        ev = totals['ev']
        ac = totals['ac']
        pv_cumulative = pv_by_ca.get(ca.id, Decimal('0'))

        previous = previous_by_ca.get(ca.id)
        previous_ev = previous.ev if previous else Decimal('0')
        previous_ac = previous.ac if previous else Decimal('0')

        EVMMetric.objects.update_or_create(
            control_account=ca,
            period=period,
            defaults={
                'ev': ev,
                'ac': ac,
                'ev_monthly': ev - previous_ev,
                'ac_monthly': ac - previous_ac,
                'pv_cumulative': pv_cumulative,
                'cv': ev - ac,
                'sv': ev - pv_cumulative,
                'cpi': (ev / ac) if ac else None,
                'spi': (ev / pv_cumulative) if pv_cumulative else None,
            },
        )
        count += 1

    return count
