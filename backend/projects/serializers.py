from rest_framework import serializers
from .models import Project


class ProjectSerializer(serializers.ModelSerializer):
    budget = serializers.ReadOnlyField()

    class Meta:
        model = Project
        fields = ['id', 'code', 'name', 'project_type', 'budget', 'created_at', 'updated_at']
