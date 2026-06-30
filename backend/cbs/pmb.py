import datetime
from decimal import Decimal

from .models import CBSControlAccount, MonthlyPV

# Configurable set of public holidays (ISO date strings) excluded from PV phasing.
PUBLIC_HOLIDAYS = set()


def is_working_day(d: datetime.date) -> bool:
    return d.weekday() < 5 and d.isoformat() not in PUBLIC_HOLIDAYS


def working_days_between(start: datetime.date, end: datetime.date) -> list[datetime.date]:
    if end < start:
        return []
    total_days = (end - start).days
    return [start + datetime.timedelta(days=i) for i in range(total_days + 1) if is_working_day(start + datetime.timedelta(days=i))]


def compute_pmb_for_project(project) -> int:
    """Recompute MonthlyPV rows for every Control Account in the project.

    Spreads each Work Package's budget (BAC) evenly across its effective working
    days (Mon-Fri, excluding PUBLIC_HOLIDAYS) between bl_start and bl_end,
    aggregates to monthly PV per Control Account, and computes PV_Cumulative.
    """
    control_accounts = list(CBSControlAccount.objects.filter(project_group__project=project))
    MonthlyPV.objects.filter(control_account__in=control_accounts).delete()

    all_periods = set()
    ca_period_pv: dict[int, dict[datetime.date, Decimal]] = {}

    for ca in control_accounts:
        period_pv: dict[datetime.date, Decimal] = {}
        for wp in ca.work_packages.all():
            if not wp.bl_start or not wp.bl_end or wp.budget <= 0:
                continue
            days = working_days_between(wp.bl_start, wp.bl_end)
            if not days:
                days = [wp.bl_start]
            per_day = wp.budget / len(days)
            for d in days:
                period = datetime.date(d.year, d.month, 1)
                period_pv[period] = period_pv.get(period, Decimal('0')) + per_day
                all_periods.add(period)
        ca_period_pv[ca.id] = period_pv

    sorted_periods = sorted(all_periods)

    objs = []
    for ca in control_accounts:
        period_pv = ca_period_pv[ca.id]
        cumulative = Decimal('0')
        started = False
        for period in sorted_periods:
            pv = period_pv.get(period, Decimal('0'))
            if not started and pv == 0:
                continue
            started = True
            cumulative += pv
            objs.append(MonthlyPV(control_account=ca, period=period, pv=pv, pv_cumulative=cumulative))

    MonthlyPV.objects.bulk_create(objs)
    return len(objs)
