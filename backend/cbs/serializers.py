from rest_framework import serializers
from .models import CBSProjectGroup, CBSControlAccount, WorkPackage, MonthlyPV


class MonthlyPVSerializer(serializers.ModelSerializer):
    class Meta:
        model = MonthlyPV
        fields = ['id', 'control_account', 'period', 'pv', 'pv_cumulative']


class WorkPackageSerializer(serializers.ModelSerializer):
    ca_code = serializers.CharField(source='control_account.code', read_only=True)
    project_group_code = serializers.CharField(source='control_account.project_group.code', read_only=True)
    project = serializers.IntegerField(source='control_account.project_group.project_id', read_only=True)

    class Meta:
        model = WorkPackage
        fields = [
            'id', 'control_account', 'ca_code', 'project_group_code', 'project',
            'code', 'name', 'budget', 'unit', 'qty', 'bl_start', 'bl_end',
            'created_at', 'updated_at',
        ]


class CBSControlAccountSerializer(serializers.ModelSerializer):
    budget = serializers.ReadOnlyField()
    project_group_code = serializers.CharField(source='project_group.code', read_only=True)
    project = serializers.IntegerField(source='project_group.project_id', read_only=True)

    class Meta:
        model = CBSControlAccount
        fields = [
            'id', 'project_group', 'project_group_code', 'project',
            'code', 'description', 'budget', 'created_at', 'updated_at',
        ]


class CBSProjectGroupSerializer(serializers.ModelSerializer):
    budget = serializers.ReadOnlyField()

    class Meta:
        model = CBSProjectGroup
        fields = ['id', 'project', 'code', 'description', 'budget', 'created_at', 'updated_at']
