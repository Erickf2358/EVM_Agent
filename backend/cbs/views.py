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
        project_id = request.data.get('project')
        uploaded_file = request.FILES.get('file')
        if not project_id or not uploaded_file:
            return Response({'detail': 'project and file are required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            project = Project.objects.get(pk=project_id)
        except Project.DoesNotExist:
            return Response({'detail': 'Project not found.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            rows = list(read_rows(uploaded_file, PROJECT_GROUP_HEADERS))
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        created, updated = 0, 0
        for row in rows:
            code = str(row['Code']).strip()
            description = str(row['Description']).strip() if row['Description'] is not None else ''
            obj, was_created = CBSProjectGroup.objects.update_or_create(
                project=project, code=code, defaults={'description': description}
            )
            created += int(was_created)
            updated += int(not was_created)

        return Response({'created': created, 'updated': updated, 'total': len(rows)})


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
        project_id = request.data.get('project')
        uploaded_file = request.FILES.get('file')
        if not project_id or not uploaded_file:
            return Response({'detail': 'project and file are required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            project = Project.objects.get(pk=project_id)
        except Project.DoesNotExist:
            return Response({'detail': 'Project not found.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            rows = list(read_rows(uploaded_file, CONTROL_ACCOUNT_HEADERS))
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        created, updated = 0, 0
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
            obj, was_created = CBSControlAccount.objects.update_or_create(
                project_group=project_group, code=code, defaults={'description': description}
            )
            created += int(was_created)
            updated += int(not was_created)

        return Response({'created': created, 'updated': updated, 'total': len(rows), 'errors': errors})


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
        project_id = request.data.get('project')
        uploaded_file = request.FILES.get('file')
        if not project_id or not uploaded_file:
            return Response({'detail': 'project and file are required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            project = Project.objects.get(pk=project_id)
        except Project.DoesNotExist:
            return Response({'detail': 'Project not found.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            rows = list(read_rows(uploaded_file, WORK_PACKAGE_HEADERS))
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        created, updated = 0, 0
        errors = []
        seen = {}
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
            created += int(was_created)
            updated += int(not was_created)

        return Response({'created': created, 'updated': updated, 'total': len(rows), 'errors': errors})
