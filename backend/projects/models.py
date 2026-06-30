from django.db import models


class Project(models.Model):
    PROJECT_TYPE_CHOICES = [
        ('construction', 'Construction'),
        ('infrastructure', 'Infrastructure'),
        ('engineering', 'Engineering'),
        ('other', 'Other'),
    ]

    code = models.CharField(max_length=50, unique=True, help_text='Project ID')
    name = models.CharField(max_length=255)
    project_type = models.CharField(max_length=50, choices=PROJECT_TYPE_CHOICES, default='other')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['code']

    def __str__(self):
        return f'{self.code} - {self.name}'

    @property
    def budget(self):
        """Total budget (BAC), rolled up from Project Groups -> Control Accounts -> Work Packages."""
        from cbs.models import WorkPackage

        return WorkPackage.objects.filter(
            control_account__project_group__project=self, is_cost_activity=False
        ).aggregate(total=models.Sum('budget'))['total'] or 0
