import re
from datetime import datetime
from decimal import Decimal, InvalidOperation

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from projects.models import Project
from cbs.models import CBSControlAccount, WorkPackage, MonthlyPV
from cbs.excel import build_prefilled_template, read_rows

from .models import Period, PeriodProgress, EVMMetric
from .serializers import PeriodSerializer, PeriodProgressSerializer, EVMMetricSerializer
from .evm import compute_evm_for_period

PERIOD_PROGRESS_HEADERS = [
    'CBS CA', 'CBS WP', 'Activity', 'Budget', 'Budget Qty', 'Unit', 'BL Start', 'BL End',
    'Actual Start', 'Actual Finish', 'Actual Qty', 'AC', 'ETC',
]


def parse_decimal(value, default=Decimal('0')):
    if value is None or value == '':
        return default
    if isinstance(value, (int, float, Decimal)):
        return Decimal(str(value))
    cleaned = re.sub(r'[^0-9.\-]', '', str(value))
    if not cleaned:
        return default
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        return default


def parse_date(value):
    if value is None or value == '':
        return None
    if hasattr(value, 'date'):
        return value.date()
    if hasattr(value, 'year') and hasattr(value, 'month') and hasattr(value, 'day'):
        return value
    for fmt in ('%m/%d/%Y', '%Y-%m-%d', '%m/%d/%y'):
        try:
            return datetime.strptime(str(value).strip(), fmt).date()
        except ValueError:
            continue
    return None


class PeriodViewSet(viewsets.ModelViewSet):
    serializer_class = PeriodSerializer

    def get_queryset(self):
        queryset = Period.objects.all()
        project_id = self.request.query_params.get('project')
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        return queryset


class PeriodProgressViewSet(viewsets.ModelViewSet):
    serializer_class = PeriodProgressSerializer

    def get_queryset(self):
        queryset = PeriodProgress.objects.select_related('work_package__control_account')
        period_id = self.request.query_params.get('period')
        if period_id:
            queryset = queryset.filter(period_id=period_id)
        return queryset

    @action(detail=False, methods=['get'], url_path='template')
    def template(self, request):
        project_id = request.query_params.get('project')
        if not project_id:
            return Response({'detail': 'project is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            project = Project.objects.get(pk=project_id)
        except Project.DoesNotExist:
            return Response({'detail': 'Project not found.'}, status=status.HTTP_404_NOT_FOUND)

        work_packages = WorkPackage.objects.filter(
            control_account__project_group__project=project
        ).select_related('control_account').order_by('control_account__code', 'code')

        latest_progress = {}
        for progress in PeriodProgress.objects.filter(
            period__project=project
        ).select_related('period').order_by('period__year', 'period__month'):
            latest_progress[progress.work_package_id] = progress

        rows = []
        for wp in work_packages:
            previous = latest_progress.get(wp.id)
            rows.append([
                wp.control_account.code,
                wp.code,
                wp.name,
                wp.budget,
                wp.qty,
                wp.unit,
                wp.bl_start.isoformat() if wp.bl_start else '',
                wp.bl_end.isoformat() if wp.bl_end else '',
                previous.start.isoformat() if previous and previous.start else '',
                previous.finish.isoformat() if previous and previous.finish else '',
                previous.actual_qty if previous else '',
                previous.ac if previous else '',
                previous.etc if previous else '',
            ])

        return build_prefilled_template('Period_Progress', PERIOD_PROGRESS_HEADERS, rows)

    def _load_period_and_rows(self, request):
        period_id = request.data.get('period')
        uploaded_file = request.FILES.get('file')
        if not period_id or not uploaded_file:
            return None, None, Response({'detail': 'period and file are required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            period = Period.objects.get(pk=period_id)
        except Period.DoesNotExist:
            return None, None, Response({'detail': 'Period not found.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            rows = list(read_rows(uploaded_file, PERIOD_PROGRESS_HEADERS))
        except ValueError as exc:
            return None, None, Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return period, rows, None

    def _process_rows(self, period, rows, commit):
        control_accounts_by_code = {}
        ambiguous_ca_codes = set()
        for ca in CBSControlAccount.objects.filter(project_group__project=period.project):
            if ca.code in control_accounts_by_code:
                ambiguous_ca_codes.add(ca.code)
            else:
                control_accounts_by_code[ca.code] = ca

        work_packages_by_key = {
            (wp.control_account_id, wp.code): wp
            for wp in WorkPackage.objects.filter(control_account__project_group__project=period.project)
        }

        existing_progress = {
            pp.work_package_id: pp
            for pp in PeriodProgress.objects.filter(period=period)
        }

        seen = {}
        created, updated = 0, 0
        created_codes, updated_codes = [], []
        errors = []
        pending = {}

        for i, row in enumerate(rows, start=2):
            ca_code = str(row['CBS CA']).strip() if row['CBS CA'] is not None else ''
            wp_code = str(row['CBS WP']).strip() if row['CBS WP'] is not None else ''

            if (ca_code, wp_code) in seen:
                errors.append(
                    f'Row {i}: Duplicate entry for CBS WP "{wp_code}" under CBS CA "{ca_code}" '
                    f'(already used in row {seen[(ca_code, wp_code)]}).'
                )
                continue
            seen[(ca_code, wp_code)] = i

            if ca_code in ambiguous_ca_codes:
                errors.append(f'Row {i}: Work Package "{wp_code}" under CBS CA "{ca_code}" is ambiguous.')
                continue
            control_account = control_accounts_by_code.get(ca_code)
            work_package = work_packages_by_key.get((control_account.id, wp_code)) if control_account else None
            if work_package is None:
                errors.append(
                    f'Row {i}: Work Package "{wp_code}" not found under CBS CA "{ca_code}" in this project.'
                )
                continue

            is_new = work_package.id not in existing_progress

            if is_new:
                created += 1
                created_codes.append(wp_code)
            else:
                updated += 1
                updated_codes.append(wp_code)

            if commit:
                obj = existing_progress.get(work_package.id) or pending.get(work_package.id)
                if obj is None:
                    obj = PeriodProgress(period=period, work_package=work_package)
                obj.start = parse_date(row['Actual Start'])
                obj.finish = parse_date(row['Actual Finish'])
                obj.actual_qty = parse_decimal(row['Actual Qty'])
                obj.ac = parse_decimal(row['AC'])
                obj.etc = parse_decimal(row['ETC'])
                pending[work_package.id] = obj

        if commit:
            to_create = [obj for obj in pending.values() if obj.pk is None]
            to_update = [obj for obj in pending.values() if obj.pk is not None]
            if to_create:
                PeriodProgress.objects.bulk_create(to_create)
            if to_update:
                PeriodProgress.objects.bulk_update(
                    to_update, ['start', 'finish', 'actual_qty', 'ac', 'etc']
                )
            compute_evm_for_period(period)

        return {
            'created': created,
            'updated': updated,
            'total': len(rows),
            'errors': errors,
            'created_codes': created_codes,
            'updated_codes': updated_codes,
        }

    @action(detail=False, methods=['post'], url_path='import')
    def import_excel(self, request):
        period, rows, error = self._load_period_and_rows(request)
        if error:
            return error
        return Response(self._process_rows(period, rows, commit=True))

    @action(detail=False, methods=['post'], url_path='import/preview')
    def import_preview(self, request):
        period, rows, error = self._load_period_and_rows(request)
        if error:
            return error
        return Response(self._process_rows(period, rows, commit=False))


class EVMMetricViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = EVMMetricSerializer

    def get_queryset(self):
        queryset = EVMMetric.objects.select_related('control_account', 'period')
        project_id = self.request.query_params.get('project')
        period_id = self.request.query_params.get('period')
        if project_id:
            queryset = queryset.filter(control_account__project_group__project_id=project_id)
        if period_id:
            queryset = queryset.filter(period_id=period_id)
        return queryset

    @action(detail=False, methods=['post'], url_path='recompute')
    def recompute(self, request):
        period_id = request.data.get('period')
        if not period_id:
            return Response({'detail': 'period is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            period = Period.objects.get(pk=period_id)
        except Period.DoesNotExist:
            return Response({'detail': 'Period not found.'}, status=status.HTTP_404_NOT_FOUND)

        count = compute_evm_for_period(period)
        return Response({'updated': count})

    @action(detail=False, methods=['get'], url_path='project-histogram')
    def project_histogram(self, request):
        """Per-period PV vs EV vs AC, aggregated across all Control Accounts in the project.

        PV is sourced from cbs.MonthlyPV (the PMB, same feed as the baseline Histogram page);
        EV/AC come from EVMMetric for the periods that have monthly progress.
        """
        project_id = request.query_params.get('project')
        if not project_id:
            return Response({'detail': 'project is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            project = Project.objects.get(pk=project_id)
        except Project.DoesNotExist:
            return Response({'detail': 'Project not found.'}, status=status.HTTP_404_NOT_FOUND)

        evm_rows = EVMMetric.objects.filter(
            control_account__project_group__project=project
        ).select_related('period')

        totals: dict[tuple[int, int], dict] = {}

        pv_rows = MonthlyPV.objects.filter(control_account__project_group__project=project)
        for row in pv_rows:
            key = (row.period.year, row.period.month)
            label = f'{row.period.year}-{row.period.month:02d}'
            entry = totals.setdefault(key, {'label': label, 'pv': Decimal('0'), 'ev': Decimal('0'), 'ac': Decimal('0')})
            entry['pv'] += row.pv

        for row in evm_rows:
            key = (row.period.year, row.period.month)
            entry = totals.setdefault(key, {'label': row.period.label, 'pv': Decimal('0'), 'ev': Decimal('0'), 'ac': Decimal('0')})
            entry['ev'] += row.ev_monthly
            entry['ac'] += row.ac_monthly

        result = []
        for key in sorted(totals):
            entry = totals[key]
            result.append({
                'period': entry['label'],
                'pv': entry.get('pv', Decimal('0')),
                'ev': entry['ev'],
                'ac': entry['ac'],
            })

        return Response(result)
