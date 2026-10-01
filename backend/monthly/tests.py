import io

import openpyxl
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase

from cbs.models import CBSControlAccount, CBSProjectGroup, WorkPackage, cost_activity_code
from projects.models import Project

from .models import Period, PeriodProgress

XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

HEADERS = [
    'CBS CA', 'CBS WP', 'Activity', 'Budget', 'Budget Qty', 'Unit', 'BL Start', 'BL End',
    'Actual Start', 'Actual Finish', 'Actual Qty', 'AC', 'ETC',
]
ACTUAL_COLUMNS = HEADERS.index('Actual Qty')


def read_sheet(content):
    wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    return [list(r) for r in wb.active.iter_rows(values_only=True)]


def as_upload(content):
    return SimpleUploadedFile('data.xlsx', content, XLSX)


class PeriodProgressTemplateTests(TestCase):
    def setUp(self):
        self.project = Project.objects.create(code='P1', name='Test Project')
        self.group = CBSProjectGroup.objects.create(project=self.project, code='10', description='Structure')
        self.ca = CBSControlAccount.objects.create(project_group=self.group, code='100', description='Concrete')
        self.wp = WorkPackage.objects.create(
            control_account=self.ca, code='100.01', name='Pour footing',
            budget='1000', unit='m3', qty='100', bl_start='2026-01-05', bl_end='2026-06-30',
        )
        # The signal auto-created this; AC/ETC is booked against it.
        self.cost_activity = WorkPackage.objects.get(code=cost_activity_code('100'))

        self.jan = Period.objects.create(project=self.project, year=2026, month=1)
        self.feb = Period.objects.create(project=self.project, year=2026, month=2)
        self.mar = Period.objects.create(project=self.project, year=2026, month=3)

        self.jan_progress = PeriodProgress.objects.create(
            period=self.jan, work_package=self.wp, actual_qty=10, ac=900, etc=800,
        )
        self.feb_progress = PeriodProgress.objects.create(
            period=self.feb, work_package=self.wp, actual_qty=25, ac=2250, etc=700,
        )
        self.mar_progress = PeriodProgress.objects.create(
            period=self.mar, work_package=self.wp, actual_qty=40, ac=4000, etc=500,
        )

    def template(self, period):
        res = self.client.get(f'/api/monthly/progress/template/?period={period.pk}')
        self.assertEqual(res.status_code, 200)
        return read_sheet(res.content)

    def actuals_for(self, rows, wp_code):
        for row in rows[1:]:
            if row[1] == wp_code:
                return {'actual_qty': row[10], 'ac': row[11], 'etc': row[12]}
        raise AssertionError(f'{wp_code} missing from template')

    def test_mid_project_period_uses_its_own_cumulative_actuals(self):
        """The regression this guards: a February sheet must not carry March's numbers."""
        rows = self.template(self.feb)
        self.assertEqual(
            self.actuals_for(rows, '100.01'),
            {'actual_qty': 25, 'ac': 2250, 'etc': 700},
        )

    def test_latest_period_uses_its_own_actuals(self):
        rows = self.template(self.mar)
        self.assertEqual(
            self.actuals_for(rows, '100.01'),
            {'actual_qty': 40, 'ac': 4000, 'etc': 500},
        )

    def test_period_before_any_progress_is_blank(self):
        empty = Period.objects.create(project=self.project, year=2025, month=12)
        rows = self.template(empty)
        # Blank cells round-trip through openpyxl as None rather than ''.
        self.assertEqual(
            self.actuals_for(rows, '100.01'),
            {'actual_qty': None, 'ac': None, 'etc': None},
        )

    def test_includes_cost_activity_where_ac_is_booked(self):
        rows = self.template(self.feb)
        self.assertIn(self.cost_activity.code, [r[1] for r in rows[1:]])

    def test_baseline_columns_always_present(self):
        rows = self.template(self.feb)
        self.assertEqual(rows[0], HEADERS)
        row = next(r for r in rows[1:] if r[1] == '100.01')
        self.assertEqual(row[:8], ['100', '100.01', 'Pour footing', 1000, 100, 'm3', '2026-01-05', '2026-06-30'])

    def test_requires_and_validates_period(self):
        self.assertEqual(self.client.get('/api/monthly/progress/template/').status_code, 400)
        self.assertEqual(self.client.get('/api/monthly/progress/template/?period=9999').status_code, 404)
        self.assertEqual(self.client.get('/api/monthly/progress/template/?period=abc').status_code, 404)

    def test_reexporting_a_period_never_changes_values(self):
        """Re-uploading must not alter recorded actuals.

        The first import also creates a row for the cost activity, which has no
        progress yet; from then on the sheet is a true no-op.
        """
        fields = ['actual_qty', 'ac', 'etc', 'start', 'finish']
        res = self.client.get(f'/api/monthly/progress/template/?period={self.feb.pk}')

        first = self.client.post(
            '/api/monthly/progress/import/',
            {'period': self.feb.pk, 'file': as_upload(res.content)},
        ).json()
        self.assertEqual(first['created'], 1)  # the cost activity had no progress row
        self.assertEqual(first['updated'], 1)
        self.assertEqual(first['errors'], [])

        snapshot = list(PeriodProgress.objects.values(*fields).order_by('id'))
        self.assertEqual(PeriodProgress.objects.filter(period=self.feb).count(), 2)

        second = self.client.post(
            '/api/monthly/progress/import/',
            {'period': self.feb.pk, 'file': as_upload(res.content)},
        ).json()
        self.assertEqual(second['created'], 0)
        self.assertEqual(second['updated'], 2)
        self.assertEqual(second['errors'], [])
        self.assertEqual(list(PeriodProgress.objects.values(*fields).order_by('id')), snapshot)

    def test_import_for_earlier_period_does_not_inherit_later_actuals(self):
        """Uploading a February sheet must leave February values, not March's."""
        res = self.client.get(f'/api/monthly/progress/template/?period={self.feb.pk}')
        self.client.post(
            '/api/monthly/progress/import/',
            {'period': self.feb.pk, 'file': as_upload(res.content)},
        )
        feb = PeriodProgress.objects.get(period=self.feb, work_package=self.wp)
        self.assertEqual(feb.actual_qty, 25)
        self.assertEqual(feb.ac, 2250)
        self.assertEqual(feb.etc, 700)