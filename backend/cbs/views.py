import re
from datetime import datetime
from decimal import Decimal, InvalidOperation

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from projects.models import Project
from .models import CBSProjectGroup, CBSControlAccount, WorkPackage, MonthlyPV, cost_activity_code
from .serializers import CBSProjectGroupSerializer, CBSControlAccountSerializer, WorkPackageSerializer, MonthlyPVSerializer
from .excel import build_template, read_rows
from .pmb import compute_pmb_for_project

PROJECT_GROUP_HEADERS = ['Code', 'Description']
CONTROL_ACCOUNT_HEADERS = ['CBS PG', 'Code', 'Description']
WORK_PACKAGE_HEADERS = ['CBS CA', 'CBS WP', 'WP Name', 'Budget', 'Unit', 'Qty', 'BL Start', 'BL End']


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


def load_project_and_rows(request, expected_headers):
    """Validate the import request and parse the uploaded file.

    Returns (project, rows, None) on success, or (None, None, error_response).
    """
    project_id = request.data.get('project')
    uploaded_file = request.FILES.get('file')
    if not project_id or not uploaded_file:
        return None, None, Response({'detail': 'project and file are required.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        project = Project.objects.get(pk=project_id)
    except Project.DoesNotExist:
        return None, None, Response({'detail': 'Project not found.'}, status=status.HTTP_404_NOT_FOUND)

    try:
        rows = list(read_rows(uploaded_file, expected_headers))
    except ValueError as exc:
        return None, None, Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    return project, rows, None


def bulk_delete_response(queryset, request):
    ids = request.data.get('ids')
    if not isinstance(ids, list) or not ids:
        return Response({'detail': 'ids (non-empty list) is required.'}, status=status.HTTP_400_BAD_REQUEST)
    deleted_count, _ = queryset.filter(id__in=ids).delete()
    return Response({'deleted': deleted_count})


def process_project_group_rows(project, rows, commit):
    existing_codes = set(
        CBSProjectGroup.objects.filter(project=project).values_list('code', flat=True)
    )
    seen_codes = set()
    created, updated = 0, 0
    created_codes, updated_codes = [], []

    for row in rows:
        code = str(row['Code']).strip()
        description = str(row['Description']).strip() if row['Description'] is not None else ''
        is_new = code not in existing_codes and code not in seen_codes
        seen_codes.add(code)

        if commit:
            obj, was_created = CBSProjectGroup.objects.update_or_create(
                project=project, code=code, defaults={'description': description}
            )
            is_new = was_created

        if is_new:
            created += 1
            created_codes.append(code)
        else:
            updated += 1
            updated_codes.append(code)

    return {
        'created': created,
        'updated': updated,
        'total': len(rows),
        'created_codes': created_codes,
        'updated_codes': updated_codes,
    }


def process_control_account_rows(project, rows, commit):
    existing = set(
        CBSControlAccount.objects.filter(project_group__project=project)
        .values_list('project_group__code', 'code')
    )
    seen = set()
    created, updated = 0, 0
    created_codes, updated_codes = [], []
    errors = []

    for i, row in enumerate(rows, start=2):
        pg_code = str(row['CBS PG']).strip() if row['CBS PG'] is not None else ''
        code = str(row['Code']).strip()
        description = str(row['Description']).strip() if row['Description'] is not None else ''
        try:
            project_group = CBSProjectGroup.objects.get(project=project, code=pg_code)
        except CBSProjectGroup.DoesNotExist:
            errors.append(f'Row {i}: CBS Project Group "{pg_code}" not found in this project.')
            continue

        key = (pg_code, code)
        is_new = key not in existing and key not in seen
        seen.add(key)

        if commit:
            obj, was_created = CBSControlAccount.objects.update_or_create(
                project_group=project_group, code=code, defaults={'description': description}
            )
            is_new = was_created

        if is_new:
            created += 1
            created_codes.append(code)
        else:
            updated += 1
            updated_codes.append(code)

    return {
        'created': created,
        'updated': updated,
        'total': len(rows),
        'errors': errors,
        'created_codes': created_codes,
        'updated_codes': updated_codes,
    }


def process_work_package_rows(project, rows, commit):
    existing = set(
        WorkPackage.objects.filter(control_account__project_group__project=project)
        .values_list('control_account__code', 'code')
    )
    seen = {}
    created, updated = 0, 0
    created_codes, updated_codes = [], []
    errors = []

    for i, row in enumerate(rows, start=2):
        ca_code = str(row['CBS CA']).strip() if row['CBS CA'] is not None else ''
        code = str(row['CBS WP']).strip()
        name = str(row['WP Name']).strip() if row['WP Name'] is not None else ''

        if (ca_code, code) in seen:
            errors.append(
                f'Row {i}: Duplicate CBS WP "{code}" for CBS CA "{ca_code}" '
                f'(already used in row {seen[(ca_code, code)]}). CBS WP codes must be unique within a CBS CA.'
            )
            continue
        seen[(ca_code, code)] = i

        try:
            control_account = CBSControlAccount.objects.get(
                project_group__project=project, code=ca_code
            )
        except CBSControlAccount.DoesNotExist:
            errors.append(f'Row {i}: CBS Control Account "{ca_code}" not found in this project.')
            continue
        except CBSControlAccount.MultipleObjectsReturned:
            errors.append(f'Row {i}: CBS Control Account "{ca_code}" is ambiguous in this project.')
            continue

        if code == cost_activity_code(ca_code):
            errors.append(f'Row {i}: CBS WP code "{code}" is reserved for the auto-generated cost activity.')
            continue

        is_new = (ca_code, code) not in existing

        if commit:
            obj, was_created = WorkPackage.objects.update_or_create(
                control_account=control_account,
                code=code,
                defaults={
                    'name': name,
                    'budget': parse_decimal(row['Budget']),
                    'unit': str(row['Unit']).strip() if row['Unit'] is not None else '',
                    'qty': parse_decimal(row['Qty']),
                    'bl_start': parse_date(row['BL Start']),
                    'bl_end': parse_date(row['BL End']),
                },
            )
            is_new = was_created

        if is_new:
            created += 1
            created_codes.append(code)
        else:
            updated += 1
            updated_codes.append(code)

    return {
        'created': created,
        'updated': updated,
        'total': len(rows),
        'errors': errors,
        'created_codes': created_codes,
        'updated_codes': updated_codes,
    }


class CBSProjectGroupViewSet(viewsets.ModelViewSet):
    serializer_class = CBSProjectGroupSerializer

    def get_queryset(self):
        queryset = CBSProjectGroup.objects.all()
        project_id = self.request.query_params.get('project')
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        return queryset

    @action(detail=False, methods=['get'], url_path='template')
    def template(self, request):
        return build_template('CBS_Project_Group', PROJECT_GROUP_HEADERS)

    @action(detail=False, methods=['post'], url_path='import')
    def import_excel(self, request):
        project, rows, error = load_project_and_rows(request, PROJECT_GROUP_HEADERS)
        if error:
            return error
        return Response(process_project_group_rows(project, rows, commit=True))

    @action(detail=False, methods=['post'], url_path='import/preview')
    def import_preview(self, request):
        project, rows, error = load_project_and_rows(request, PROJECT_GROUP_HEADERS)
        if error:
            return error
        return Response(process_project_group_rows(project, rows, commit=False))

    @action(detail=False, methods=['post'], url_path='bulk-delete')
    def bulk_delete(self, request):
        return bulk_delete_response(CBSProjectGroup.objects.all(), request)


class CBSControlAccountViewSet(viewsets.ModelViewSet):
    serializer_class = CBSControlAccountSerializer

    def get_queryset(self):
        queryset = CBSControlAccount.objects.select_related('project_group')
        project_group_id = self.request.query_params.get('project_group')
        project_id = self.request.query_params.get('project')
        if project_group_id:
            queryset = queryset.filter(project_group_id=project_group_id)
        if project_id:
            queryset = queryset.filter(project_group__project_id=project_id)
        return queryset

    @action(detail=False, methods=['get'], url_path='template')
    def template(self, request):
        return build_template('CBS_Control_Account', CONTROL_ACCOUNT_HEADERS)

    @action(detail=False, methods=['post'], url_path='recompute-pmb')
    def recompute_pmb(self, request):
        project_id = request.data.get('project')
        if not project_id:
            return Response({'detail': 'project is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            project = Project.objects.get(pk=project_id)
        except Project.DoesNotExist:
            return Response({'detail': 'Project not found.'}, status=status.HTTP_404_NOT_FOUND)

        periods_created = compute_pmb_for_project(project)
        return Response({'periods_created': periods_created})

    @action(detail=True, methods=['get'], url_path='histogram')
    def histogram(self, request, pk=None):
        control_account = self.get_object()
        data = MonthlyPV.objects.filter(control_account=control_account).order_by('period')
        return Response(MonthlyPVSerializer(data, many=True).data)

    @action(detail=False, methods=['get'], url_path='project-histogram')
    def project_histogram(self, request):
        project_id = request.query_params.get('project')
        if not project_id:
            return Response({'detail': 'project is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            project = Project.objects.get(pk=project_id)
        except Project.DoesNotExist:
            return Response({'detail': 'Project not found.'}, status=status.HTTP_404_NOT_FOUND)

        rows = MonthlyPV.objects.filter(control_account__project_group__project=project).order_by('period')
        totals = {}
        for row in rows:
            totals[row.period] = totals.get(row.period, Decimal('0')) + row.pv

        result = []
        cumulative = Decimal('0')
        for period in sorted(totals):
            cumulative += totals[period]
            result.append({'period': period, 'pv': totals[period], 'pv_cumulative': cumulative})

        return Response(result)

    @action(detail=False, methods=['post'], url_path='import')
    def import_excel(self, request):
        project, rows, error = load_project_and_rows(request, CONTROL_ACCOUNT_HEADERS)
        if error:
            return error
        return Response(process_control_account_rows(project, rows, commit=True))

    @action(detail=False, methods=['post'], url_path='import/preview')
    def import_preview(self, request):
        project, rows, error = load_project_and_rows(request, CONTROL_ACCOUNT_HEADERS)
        if error:
            return error
        return Response(process_control_account_rows(project, rows, commit=False))

    @action(detail=False, methods=['post'], url_path='bulk-delete')
    def bulk_delete(self, request):
        return bulk_delete_response(CBSControlAccount.objects.all(), request)


class WorkPackageViewSet(viewsets.ModelViewSet):
    serializer_class = WorkPackageSerializer

    def get_queryset(self):
        queryset = WorkPackage.objects.select_related('control_account__project_group')
        control_account_id = self.request.query_params.get('control_account')
        project_id = self.request.query_params.get('project')
        if control_account_id:
            queryset = queryset.filter(control_account_id=control_account_id)
        if project_id:
            queryset = queryset.filter(control_account__project_group__project_id=project_id)
        if self.request.query_params.get('include_cost_activities') != '1':
            queryset = queryset.filter(is_cost_activity=False)
        return queryset

    @action(detail=False, methods=['get'], url_path='template')
    def template(self, request):
        return build_template('Work_Packages', WORK_PACKAGE_HEADERS)

    @action(detail=False, methods=['post'], url_path='import')
    def import_excel(self, request):
        project, rows, error = load_project_and_rows(request, WORK_PACKAGE_HEADERS)
        if error:
            return error
        return Response(process_work_package_rows(project, rows, commit=True))

    @action(detail=False, methods=['post'], url_path='import/preview')
    def import_preview(self, request):
        project, rows, error = load_project_and_rows(request, WORK_PACKAGE_HEADERS)
        if error:
            return error
        return Response(process_work_package_rows(project, rows, commit=False))

    @action(detail=False, methods=['post'], url_path='bulk-delete')
    def bulk_delete(self, request):
        return bulk_delete_response(WorkPackage.objects.all(), request)
