from django.contrib import admin
from .models import CBSProjectGroup, CBSControlAccount


@admin.register(CBSProjectGroup)
class CBSProjectGroupAdmin(admin.ModelAdmin):
    list_display = ['project', 'code', 'description', 'budget']
    search_fields = ['code', 'description']


@admin.register(CBSControlAccount)
class CBSControlAccountAdmin(admin.ModelAdmin):
    list_display = ['project_group', 'code', 'description', 'budget']
    search_fields = ['code', 'description']
