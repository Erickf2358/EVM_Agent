from django.apps import AppConfig


class CbsConfig(AppConfig):
    name = 'cbs'

    def ready(self):
        from . import signals  # noqa: F401
