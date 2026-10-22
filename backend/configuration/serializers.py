from rest_framework import serializers
from .models import Configuration

class ConfigurationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Configuration
        exclude = ['organisation']
        read_only_fields = ['id', 'updated_at']
