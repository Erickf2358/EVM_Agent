from django.contrib import admin
from .models import Period, PeriodProgress, EVMMetric

admin.site.register(Period)
admin.site.register(PeriodProgress)
admin.site.register(EVMMetric)
