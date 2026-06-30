from django.db import models
from projects.models import Project


class CBSProjectGroup(models.Model):
    project = models.ForeignKey(Project, related_name='project_groups', on_delete=models.CASCADE)
    code = models.CharField(max_length=50)
    description = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['code']
        unique_together = ('project', 'code')

    def __str__(self):
        return f'{self.code} - {self.description}'

    @property
    def budget(self):
        """Total budget (BAC), rolled up from Control Accounts."""
        return sum(ca.budget for ca in self.control_accounts.all())


class CBSControlAccount(models.Model):
    project_group = models.ForeignKey(CBSProjectGroup, related_name='control_accounts', on_delete=models.CASCADE)
    code = models.CharField(max_length=50)
    description = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['code']
        unique_together = ('project_group', 'code')

    def __str__(self):
        return f'{self.code} - {self.description}'

    @property
    def budget(self):
        """Total budget (BAC), rolled up from Work Packages."""
        return self.work_packages.filter(is_cost_activity=False).aggregate(
            total=models.Sum('budget')
        )['total'] or 0


class WorkPackage(models.Model):
    control_account = models.ForeignKey(CBSControlAccount, related_name='work_packages', on_delete=models.CASCADE)
    code = models.CharField(max_length=50)
    name = models.CharField(max_length=255)
    budget = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    unit = models.CharField(max_length=50, blank=True, default='')
    qty = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    bl_start = models.DateField(null=True, blank=True)
    bl_end = models.DateField(null=True, blank=True)
    is_cost_activity = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['code']
        unique_together = ('control_account', 'code')

    def __str__(self):
        return f'{self.code} - {self.name}'


def cost_activity_code(ca_code):
    return f'WP-{ca_code}.00'


class MonthlyPV(models.Model):
    control_account = models.ForeignKey(CBSControlAccount, related_name='monthly_pv', on_delete=models.CASCADE)
    period = models.DateField(help_text='First day of the month this PV applies to')
    pv = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    pv_cumulative = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    class Meta:
        ordering = ['period']
        unique_together = ('control_account', 'period')

    def __str__(self):
        return f'{self.control_account.code} - {self.period}'
