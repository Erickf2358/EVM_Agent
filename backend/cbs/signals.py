from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import CBSControlAccount, WorkPackage, cost_activity_code


@receiver(post_save, sender=CBSControlAccount)
def create_cost_activity_work_package(sender, instance, created, **kwargs):
    if not created:
        return
    WorkPackage.objects.get_or_create(
        control_account=instance,
        code=cost_activity_code(instance.code),
        defaults={
            'name': f'{instance.description} (AC/ETC)',
            'is_cost_activity': True,
        },
    )
