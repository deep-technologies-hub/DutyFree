"""
Isolation des données par organisation.

- TenantScopedViewSetMixin : filtre le queryset sur l'organisation de l'utilisateur.
- TenantModelSerializer    : renseigne `organisation` automatiquement (champ caché)
                             et restreint toutes les FK aux objets de la même organisation,
                             pour qu'un id d'un autre client ne puisse jamais être référencé.
"""
from rest_framework import serializers


def has_organisation_field(model):
    return any(f.name == 'organisation' for f in model._meta.fields)


def current_organisation(context):
    request = context.get('request')
    user = getattr(request, 'user', None)
    return getattr(user, 'organisation', None)


class CurrentOrganisationDefault:
    requires_context = True

    def __call__(self, serializer_field):
        return current_organisation(serializer_field.context)


class TenantScopedFieldsMixin:
    """Restreint les querysets des champs relationnels à l'organisation courante."""

    def get_fields(self):
        fields = super().get_fields()
        org = current_organisation(self.context)
        for name, field in fields.items():
            relation = getattr(field, 'child_relation', field)
            queryset = getattr(relation, 'queryset', None)
            if queryset is None or name == 'organisation':
                continue
            if has_organisation_field(queryset.model):
                relation.queryset = queryset.filter(organisation=org) if org else queryset.none()
        return fields


class TenantModelSerializer(TenantScopedFieldsMixin, serializers.ModelSerializer):
    def get_fields(self):
        fields = super().get_fields()
        if has_organisation_field(self.Meta.model):
            # Champ caché : jamais exposé, jamais modifiable par le client,
            # mais présent pour les validateurs d'unicité par organisation.
            fields['organisation'] = serializers.HiddenField(default=CurrentOrganisationDefault())
        return fields


class TenantScopedViewSetMixin:
    @property
    def tenant(self):
        return self.request.user.organisation

    def get_queryset(self):
        return super().get_queryset().filter(organisation=self.tenant)

    def perform_create(self, serializer, **extra):
        serializer.save(organisation=self.tenant, **extra)
