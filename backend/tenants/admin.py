"""
Console d'administration de la plateforme SaaS, réservée aux opérateurs
(superutilisateurs sans organisation). Les administrateurs d'une boutique
n'y ont PAS accès : /admin/ exige is_staff, qu'eux n'ont pas.

Permet notamment d'activer un abonnement sans paiement en ligne (espèces,
virement, geste commercial) et de suivre l'activité de la plateforme.
"""
from django.contrib import admin, messages
from django.db.models import Count, Sum
from django.template.response import TemplateResponse
from django.urls import path
from django.utils import timezone

from .models import Facture, Organisation, PaiementEvenement, Plan


def fmt(n):
    return f"{int(n or 0):,}".replace(',', ' ')


@admin.register(Plan)
class PlanAdmin(admin.ModelAdmin):
    list_display = ['nom', 'code', 'prix_mensuel_xof', 'max_utilisateurs', 'max_produits', 'max_caisses', 'actif', 'ordre']
    list_editable = ['actif', 'ordre']


class FactureInline(admin.TabularInline):
    model = Facture
    extra = 0
    fields = ['numero', 'plan', 'mois', 'montant_xof', 'statut', 'created_at', 'payee_le']
    readonly_fields = fields
    can_delete = False
    show_change_link = True


def _offrir(modeladmin, request, queryset, mois):
    """Prolonge l'abonnement de `mois` via une facture offerte (montant 0), pour l'audit."""
    n = 0
    for org in queryset:
        facture = Facture.objects.create(organisation=org, plan=org.plan, mois=mois, montant_xof=0)
        facture.marquer_payee(methode='autre', reference=f"Offert par {request.user.username} ({mois} mois)")
        n += 1
    modeladmin.message_user(request, f"{n} organisation(s) prolongée(s) de {mois} mois (offert).", messages.SUCCESS)


@admin.register(Organisation)
class OrganisationAdmin(admin.ModelAdmin):
    list_display = ['nom', 'slug', 'plan', 'statut', 'date_fin', 'jours_restants', 'est_active', 'created_at']
    list_filter = ['statut', 'plan']
    search_fields = ['nom', 'slug', 'email']
    readonly_fields = ['created_at']
    inlines = [FactureInline]
    actions = ['offrir_1_mois', 'offrir_3_mois', 'offrir_6_mois', 'offrir_12_mois', 'suspendre', 'reactiver']
    change_list_template = 'admin/tenants/organisation/change_list.html'

    @admin.display(boolean=True, description='Écriture autorisée')
    def est_active(self, obj):
        return obj.est_active

    @admin.display(description='Jours restants')
    def jours_restants(self, obj):
        return obj.jours_restants

    @admin.action(description='Activer / offrir 1 mois')
    def offrir_1_mois(self, request, queryset):
        _offrir(self, request, queryset, 1)

    @admin.action(description='Activer / offrir 3 mois')
    def offrir_3_mois(self, request, queryset):
        _offrir(self, request, queryset, 3)

    @admin.action(description='Activer / offrir 6 mois')
    def offrir_6_mois(self, request, queryset):
        _offrir(self, request, queryset, 6)

    @admin.action(description='Activer / offrir 12 mois')
    def offrir_12_mois(self, request, queryset):
        _offrir(self, request, queryset, 12)

    @admin.action(description='Suspendre les organisations sélectionnées')
    def suspendre(self, request, queryset):
        n = queryset.update(statut='suspendu')
        self.message_user(request, f"{n} organisation(s) suspendue(s).")

    @admin.action(description="Réactiver (statut actif, sans changer l'échéance)")
    def reactiver(self, request, queryset):
        n = queryset.update(statut='actif')
        self.message_user(request, f"{n} organisation(s) réactivée(s).")

    # ── Tableau de bord opérateur ────────────────────────────────────
    def get_urls(self):
        extra = [path('tableau-de-bord/', self.admin_site.admin_view(self.tableau_de_bord),
                      name='operateur_dashboard')]
        return extra + super().get_urls()

    def changelist_view(self, request, extra_context=None):
        from django.urls import reverse
        extra_context = extra_context or {}
        extra_context['dashboard_url'] = reverse('admin:operateur_dashboard')
        return super().changelist_view(request, extra_context)

    def tableau_de_bord(self, request):
        now = timezone.now()
        orgs = list(Organisation.objects.select_related('plan').all())
        par_statut = {r['statut']: r['n'] for r in Organisation.objects.values('statut').annotate(n=Count('id'))}

        revenu_mois = Facture.objects.filter(statut='payee', payee_le__year=now.year,
                                             payee_le__month=now.month).aggregate(s=Sum('montant_xof'))['s']
        revenu_total = Facture.objects.filter(statut='payee').aggregate(s=Sum('montant_xof'))['s']
        # Revenu mensuel récurrent : somme des prix des plans des abonnements payants actifs.
        mrr = sum(o.plan.prix_mensuel_xof for o in orgs if o.statut == 'actif')

        def cle_tri(o):
            return (o.date_fin is None, o.date_fin or now)

        rows = []
        for o in sorted(orgs, key=cle_tri):
            u = o.usage()
            rows.append({
                'nom': o.nom, 'slug': o.slug, 'plan': o.plan.nom, 'statut': o.statut,
                'statut_label': o.get_statut_display(), 'est_active': o.est_active,
                'date_fin': o.date_fin.strftime('%d/%m/%Y') if o.date_fin else '—',
                'jours': o.jours_restants,
                'caisses': f"{u['caisses']} / {o.plan.max_caisses if o.plan.max_caisses is not None else '∞'}",
                'users': f"{u['utilisateurs']} / {o.plan.max_utilisateurs if o.plan.max_utilisateurs is not None else '∞'}",
                'produits': f"{u['produits']} / {o.plan.max_produits if o.plan.max_produits is not None else '∞'}",
            })

        context = {
            **self.admin_site.each_context(request),
            'title': 'Tableau de bord opérateur',
            'cartes': [
                ('Boutiques', str(len(orgs))),
                ('Essais en cours', str(par_statut.get('essai', 0))),
                ('Abonnements actifs', str(par_statut.get('actif', 0))),
                ('Expirés / suspendus', str(par_statut.get('expire', 0) + par_statut.get('suspendu', 0))),
                ('Revenu ce mois (XOF)', fmt(revenu_mois)),
                ('MRR actifs (XOF)', fmt(mrr)),
                ('Revenu total (XOF)', fmt(revenu_total)),
            ],
            'rows': rows,
        }
        return TemplateResponse(request, 'admin/tenants/operateur_dashboard.html', context)


class PaiementEvenementInline(admin.TabularInline):
    model = PaiementEvenement
    extra = 0
    fields = ['created_at', 'prestataire', 'type', 'statut', 'details']
    readonly_fields = fields
    can_delete = False


@admin.register(Facture)
class FactureAdmin(admin.ModelAdmin):
    inlines = [PaiementEvenementInline]
    list_display = ['numero', 'organisation', 'plan', 'mois', 'montant_xof', 'statut', 'prestataire', 'created_at', 'payee_le']
    list_filter = ['statut', 'plan']
    search_fields = ['numero', 'organisation__nom', 'reference_paiement', 'transaction_id']
    readonly_fields = ['numero', 'transaction_id', 'prestataire', 'periode_debut', 'periode_fin', 'created_at', 'payee_le', 'rappel_envoye_le']
    actions = ['marquer_payees']

    @admin.action(description="Marquer comme payée(s) et prolonger l'abonnement")
    def marquer_payees(self, request, queryset):
        n = 0
        for facture in queryset.exclude(statut='payee'):
            if facture.statut == 'annulee':
                continue
            facture.marquer_payee()
            n += 1
        self.message_user(request, f"{n} facture(s) encaissée(s).", messages.SUCCESS)

