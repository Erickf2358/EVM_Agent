from django.db import models
from projects.models import Project
from cbs.models import WorkPackage


class Period(models.Model):
    project = models.ForeignKey(Project, related_name='periods', on_delete=models.CASCADE)
    year = models.PositiveIntegerField()
    month = models.PositiveSmallIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['year', 'month']
        unique_together = ('project', 'year', 'month')

    def __str__(self):
        return f'{self.project.code} - {self.label}'

    @property
    def label(self):
        return f'{self.year}-{self.month:02d}'


class PeriodProgress(models.Model):
    period = models.ForeignKey(Period, related_name='progress', on_delete=models.CASCADE)
    work_package = models.ForeignKey(WorkPackage, related_name='monthly_progress', on_delete=models.CASCADE)
    budget = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    start = models.DateField(null=True, blank=True)
    finish = models.DateField(null=True, blank=True)
    actual_qty = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    ev = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    ac = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    etc = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    eac = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['work_package__control_account__code', 'work_package__code']
        unique_together = ('period', 'work_package')

    def __str__(self):
        return f'{self.period} - {self.work_package.code}'


class EVMMetric(models.Model):
    control_account = models.ForeignKey(
        'cbs.CBSControlAccount', related_name='evm_metrics', on_delete=models.CASCADE
    )
    period = models.ForeignKey(Period, related_name='evm_metrics', on_delete=models.CASCADE)
    ev = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    ac = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    ev_monthly = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    ac_monthly = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    pv_cumulative = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    cv = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    sv = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    cpi = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True)
    spi = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True)

    class Meta:
        ordering = ['period', 'control_account__code']
        unique_together = ('control_account', 'period')

    def __str__(self):
        return f'{self.control_account.code} - {self.period.label}'
