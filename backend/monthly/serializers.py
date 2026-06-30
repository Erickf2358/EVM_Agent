from rest_framework import serializers
from .models import Period, PeriodProgress, EVMMetric


class PeriodSerializer(serializers.ModelSerializer):
    label = serializers.ReadOnlyField()

    class Meta:
        model = Period
        fields = ['id', 'project', 'year', 'month', 'label', 'created_at', 'updated_at']


class PeriodProgressSerializer(serializers.ModelSerializer):
    ca_code = serializers.CharField(source='work_package.control_account.code', read_only=True)
    wp_code = serializers.CharField(source='work_package.code', read_only=True)
    activity = serializers.CharField(source='work_package.name', read_only=True)
    budget = serializers.DecimalField(source='work_package.budget', read_only=True, max_digits=14, decimal_places=2)
    bl_start = serializers.DateField(source='work_package.bl_start', read_only=True)
    bl_end = serializers.DateField(source='work_package.bl_end', read_only=True)
    budget_qty = serializers.DecimalField(source='work_package.qty', read_only=True, max_digits=14, decimal_places=2)
    unit = serializers.CharField(source='work_package.unit', read_only=True)
    is_cost_activity = serializers.BooleanField(source='work_package.is_cost_activity', read_only=True)

    class Meta:
        model = PeriodProgress
        fields = [
            'id', 'period', 'work_package', 'ca_code', 'wp_code', 'activity',
            'budget', 'budget_qty', 'unit', 'bl_start', 'bl_end', 'start', 'finish', 'actual_qty',
            'ev', 'ac', 'etc', 'eac', 'is_cost_activity', 'created_at', 'updated_at',
        ]


class EVMMetricSerializer(serializers.ModelSerializer):
    ca_code = serializers.CharField(source='control_account.code', read_only=True)
    ca_description = serializers.CharField(source='control_account.description', read_only=True)
    period_label = serializers.CharField(source='period.label', read_only=True)
    ev = serializers.DecimalField(max_digits=14, decimal_places=2, coerce_to_string=False)
    ac = serializers.DecimalField(max_digits=14, decimal_places=2, coerce_to_string=False)
    ev_monthly = serializers.DecimalField(max_digits=14, decimal_places=2, coerce_to_string=False)
    ac_monthly = serializers.DecimalField(max_digits=14, decimal_places=2, coerce_to_string=False)
    pv_cumulative = serializers.DecimalField(max_digits=14, decimal_places=2, coerce_to_string=False)
    cv = serializers.DecimalField(max_digits=14, decimal_places=2, coerce_to_string=False)
    sv = serializers.DecimalField(max_digits=14, decimal_places=2, coerce_to_string=False)
    cpi = serializers.DecimalField(max_digits=10, decimal_places=4, coerce_to_string=False, allow_null=True)
    spi = serializers.DecimalField(max_digits=10, decimal_places=4, coerce_to_string=False, allow_null=True)

    class Meta:
        model = EVMMetric
        fields = [
            'id', 'control_account', 'ca_code', 'ca_description', 'period', 'period_label',
            'ev', 'ac', 'ev_monthly', 'ac_monthly', 'pv_cumulative', 'cv', 'sv', 'cpi', 'spi',
        ]
