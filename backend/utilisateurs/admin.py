from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import Utilisateur

@admin.register(Utilisateur)
class UtilisateurAdmin(UserAdmin):
    list_display = ['username', 'full_name', 'organisation', 'role', 'register_id', 'is_active', 'last_login']
    list_filter = ['organisation', 'role', 'is_active', 'is_superuser']
    search_fields = ['username', 'first_name', 'last_name', 'email', 'organisation__nom']
    fieldsets = UserAdmin.fieldsets + (
        ('Duty Free', {'fields': ('organisation', 'role', 'register_id', 'phone')}),
    )
