from datetime import timedelta
from decimal import Decimal

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone

from configuration.models import Configuration
from stock.models import Categorie
from tenants.tests import client_for, make_org, produit
from utilisateurs.models import Utilisateur
from ventes.models import Vente


class FiltresVentesEtExportsTests(TestCase):
    """Filtres utilisés par le backoffice (liste des ventes, exports) et isolation associée."""

    def setUp(self):
        cache.clear()
        self.a, self.admin_a = make_org('alpha')
        self.b, self.admin_b = make_org('beta')
        self.pa = produit(self.a, 'A-1', stock=100)
        self.pb = produit(self.b, 'B-1', stock=100)
        self.c = client_for(self.admin_a)

    def vendre(self, client, prod, ticket, caisse, methode, quand=None, montant=1000, rendu=0):
        r = client.post('/api/ventes/', {
            'numero_ticket': ticket, 'numero_caisse': caisse, 'devise': 'XOF',
            'sous_total': montant, 'total': montant, 'date_locale': (quand or timezone.now()).isoformat(),
            'lignes': [{'produit': prod.id, 'quantite': 1, 'prix_unitaire': montant, 'total': montant}],
            'paiements': [{'methode': methode, 'montant': montant + rendu, 'montant_xof': montant + rendu,
                           'monnaie_rendue': rendu}],
        }, format='json')
        self.assertEqual(r.status_code, 201, r.data)

    def tickets(self, url):
        return sorted(v['numero_ticket'] for v in self.c.get(url).data['results'])

    def test_filtres_periode_caisse_et_moyen_de_paiement(self):
        ancien = timezone.now() - timedelta(days=40)
        self.vendre(self.c, self.pa, 'T-1', 'CAISSE-01', 'especes')
        self.vendre(self.c, self.pa, 'T-2', 'CAISSE-02', 'carte')
        self.vendre(self.c, self.pa, 'T-3', 'CAISSE-01', 'mobile_money', quand=ancien)

        debut = (timezone.now() - timedelta(days=7)).date().isoformat()
        self.assertEqual(self.tickets(f'/api/ventes/?date_debut={debut}'), ['T-1', 'T-2'])
        self.assertEqual(self.tickets(f'/api/ventes/?date_fin={ancien.date().isoformat()}'), ['T-3'])
        self.assertEqual(self.tickets('/api/ventes/?numero_caisse=CAISSE-01'), ['T-1', 'T-3'])
        self.assertEqual(self.tickets('/api/ventes/?methode=carte'), ['T-2'])
        # La liste expose les paiements (moyen de paiement affiché dans le backoffice)
        vente = self.c.get('/api/ventes/?methode=carte').data['results'][0]
        self.assertEqual(vente['paiements'][0]['methode'], 'carte')

    def test_caisses_isolees_par_organisation(self):
        self.vendre(self.c, self.pa, 'T-1', 'CAISSE-02', 'especes')
        self.vendre(self.c, self.pa, 'T-2', 'CAISSE-01', 'especes')
        self.vendre(client_for(self.admin_b), self.pb, 'T-1', 'CAISSE-BETA', 'especes')
        self.assertEqual(self.c.get('/api/ventes/caisses/').data, ['CAISSE-01', 'CAISSE-02'])

    def test_page_size_pour_les_exports(self):
        for i in range(60):
            produit(self.a, f'X-{i}')
        r = self.c.get('/api/stock/produits/')
        self.assertEqual(len(r.data['results']), 50)
        r = self.c.get('/api/stock/produits/?page_size=1000')
        self.assertEqual(len(r.data['results']), 61)
        self.assertIsNone(r.data['next'])

    def test_dashboard_paiements_nets_de_la_monnaie_rendue(self):
        self.vendre(self.c, self.pa, 'T-1', 'CAISSE-01', 'especes', montant=8000, rendu=2000)
        paiements = self.c.get('/api/ventes/dashboard/').data['ca_by_payment']
        self.assertEqual(float(paiements[0]['amount']), 8000)

    def test_taux_capture_modifiable(self):
        now = timezone.now()
        r = self.c.post('/api/ventes/passagers/', {'annee': now.year, 'mois': now.month,
                                                    'nombre_passagers': 1000, 'source': 'Aéroport'}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.vendre(self.c, self.pa, 'T-1', 'CAISSE-01', 'especes')
        ligne = self.c.get('/api/ventes/taux_capture/').data[0]
        self.assertEqual((ligne['id'], ligne['tickets'], ligne['source']), (r.data['id'], 1, 'Aéroport'))
        self.assertEqual(self.c.patch(f"/api/ventes/passagers/{ligne['id']}/", {'nombre_passagers': 500},
                                      format='json').status_code, 200)
        self.assertEqual(self.c.get('/api/ventes/taux_capture/').data[0]['taux'], 0.2)
        # Une autre organisation ne peut ni lire ni modifier ces données
        self.assertEqual(client_for(self.admin_b).patch(f"/api/ventes/passagers/{ligne['id']}/",
                                                        {'nombre_passagers': 1}, format='json').status_code, 404)


class MontantsRecalculesTests(TestCase):
    """Les montants d'une vente viennent du catalogue, jamais de la caisse."""

    def setUp(self):
        cache.clear()
        self.a, self.admin_a = make_org('alpha')
        self.p = produit(self.a, 'A-1', stock=100, prix_eur=10)
        self.c = client_for(self.admin_a)
        Configuration.objects.filter(organisation=self.a).update(taux_eur_xof=650)

    def payload(self, ticket='T-1', devise='XOF'):
        return {
            'numero_ticket': ticket, 'numero_caisse': 'C1', 'devise': devise,
            'sous_total': 1, 'remise_totale': 0, 'total': 1, 'date_locale': timezone.now().isoformat(),
            'lignes': [{'produit': self.p.id, 'quantite': 2, 'prix_unitaire': 1, 'total': 2}],
            'paiements': [{'methode': 'especes', 'montant': 2, 'montant_xof': 2}],
        }

    def test_prix_falsifie_enregistre_au_vrai_prix(self):
        r = self.c.post('/api/ventes/', self.payload(), format='json')
        self.assertEqual(r.status_code, 201, r.data)
        vente = Vente.objects.get(numero_ticket='T-1')
        ligne = vente.lignes.get()
        self.assertEqual((ligne.prix_unitaire, ligne.total), (Decimal('1000'), Decimal('2000')))
        self.assertEqual((vente.sous_total, vente.remise_totale, vente.total),
                         (Decimal('2000'), Decimal('0'), Decimal('2000')))
        # La réponse renvoie les montants recalculés, lignes comprises
        self.assertEqual(Decimal(r.data['total']), Decimal('2000'))
        self.assertEqual(Decimal(r.data['lignes'][0]['prix_unitaire']), Decimal('1000'))
        self.assertEqual(r.data['lignes'][0]['produit_nom'], 'Produit A-1')

    def test_remise_et_conversion_dans_la_devise_de_la_vente(self):
        # 2 × 10 EUR à −10 % = 18 EUR, vente en XOF au taux configuré de 650
        r = self.c.post('/api/ventes/', self.payload() | {
            'lignes': [{'produit': self.p.id, 'quantite': 2, 'devise': 'EUR', 'remise': 10,
                        'prix_unitaire': 1, 'total': 1}]}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        vente = Vente.objects.get(numero_ticket='T-1')
        self.assertEqual(vente.lignes.get().total, Decimal('18'))
        self.assertEqual((vente.sous_total, vente.remise_totale, vente.total),
                         (Decimal('13000'), Decimal('1300'), Decimal('11700')))

    def test_sync_offline_recalcule_aussi(self):
        self.c.post('/api/ventes/sync_offline/', {'ventes': [self.payload('OFF-1')]}, format='json')
        self.assertEqual(Vente.objects.get(numero_ticket='OFF-1').total, Decimal('2000'))

    def test_dashboard_ca_par_categorie_converti_en_xof(self):
        # 2 × 10 EUR (13 000 XOF au taux de 650) + 1 × 1 000 XOF
        self.c.post('/api/ventes/', self.payload() | {'lignes': [
            {'produit': self.p.id, 'quantite': 2, 'devise': 'EUR'},
            {'produit': self.p.id, 'quantite': 1, 'devise': 'XOF'}]}, format='json')
        cat = self.c.get('/api/ventes/dashboard/').data['ca_by_categorie'][0]
        self.assertEqual(Decimal(cat['ca']), Decimal('14000'))

    def test_statistiques_en_xof_au_taux_du_jour_de_la_vente(self):
        # Vente de 20 EUR à 650 : 13 000 XOF, même si le taux change ensuite
        self.c.post('/api/ventes/', self.payload(devise='EUR') | {
            'lignes': [{'produit': self.p.id, 'quantite': 2, 'devise': 'EUR'}]}, format='json')
        self.assertEqual(Vente.objects.get().total_xof, Decimal('13000'))
        Configuration.objects.filter(organisation=self.a).update(taux_eur_xof=700)
        dash = self.c.get('/api/ventes/dashboard/').data
        for ca in (dash['ca_month'], dash['ca_today'], dash['ticket_moyen'],
                   dash['ca_daily'][0]['ca'], dash['ca_by_cashier'][0]['ca'], dash['ca_by_categorie'][0]['ca']):
            self.assertEqual(Decimal(ca), Decimal('13000'))

    def test_remise_reservee_a_la_gestion(self):
        avec_remise = lambda ticket: self.payload(ticket) | {
            'lignes': [{'produit': self.p.id, 'quantite': 1, 'remise': 50}]}
        caissier = Utilisateur.objects.create(organisation=self.a, username='awa', role='caissier')
        r = client_for(caissier).post('/api/ventes/', avec_remise('T-1'), format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('remise', str(r.data))
        sup = Utilisateur.objects.create(organisation=self.a, username='sam', role='superviseur')
        self.assertEqual(client_for(sup).post('/api/ventes/', avec_remise('T-2'), format='json').status_code, 201)
        self.assertEqual(Vente.objects.get().total, Decimal('500'))

    def test_prix_absent_dans_la_devise_refuse(self):
        r = self.c.post('/api/ventes/', self.payload(devise='USD') | {
            'lignes': [{'produit': self.p.id, 'quantite': 1, 'devise': 'USD'}]}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertFalse(Vente.objects.exists())


class CategoriesTests(TestCase):
    def setUp(self):
        cache.clear()
        self.a, self.admin_a = make_org('alpha')
        self.c = client_for(self.admin_a)

    def test_crud_categories_et_produit_rattache(self):
        r = self.c.post('/api/stock/categories/', {'nom': 'Montres', 'couleur': '#123456'}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        cat_id = r.data['id']
        p = self.c.post('/api/stock/produits/', {'code': 'M-1', 'nom': 'Montre', 'prix_xof': 10,
                                                 'categorie': cat_id}, format='json')
        self.assertEqual(p.status_code, 201, p.data)
        stats = {c['nom']: c['nombre_produits'] for c in self.c.get('/api/stock/categories/avec_stats/').data}
        self.assertEqual(stats['Montres'], 1)
        self.assertEqual(self.c.get(f"/api/stock/produits/{p.data['id']}/").data['categorie_nom'], 'Montres')
        # Suppression : le produit reste, sans catégorie
        self.assertEqual(self.c.delete(f'/api/stock/categories/{cat_id}/').status_code, 204)
        self.assertIsNone(self.c.get(f"/api/stock/produits/{p.data['id']}/").data['categorie'])

    def test_categorie_d_une_autre_organisation_refusee(self):
        b, _ = make_org('beta')
        cat_b = Categorie.objects.filter(organisation=b).first()
        r = self.c.post('/api/stock/produits/', {'code': 'M-1', 'nom': 'x', 'prix_xof': 10,
                                                 'categorie': cat_b.id}, format='json')
        self.assertEqual(r.status_code, 400)


class SommiersTests(TestCase):
    def setUp(self):
        cache.clear()
        self.a, self.admin_a = make_org('alpha')
        self.c = client_for(self.admin_a)
        self.p = produit(self.a, 'A-1', stock=50)

    def test_ouverture_puis_apurement_par_les_ventes(self):
        r = self.c.post('/api/stock/sommiers/', {
            'numero': 'SOM-1', 'produit': self.p.id, 'quantite_initiale': 2, 'quantite_entree': 2,
            'date_ouverture': timezone.now().date().isoformat(),
        }, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        for ticket in ('T-1', 'T-2'):
            self.assertEqual(self.c.post('/api/ventes/', {
                'numero_ticket': ticket, 'numero_caisse': 'C1', 'devise': 'XOF', 'sous_total': 1000,
                'total': 1000, 'date_locale': timezone.now().isoformat(),
                'lignes': [{'produit': self.p.id, 'quantite': 1, 'prix_unitaire': 1000, 'total': 1000}],
                'paiements': [{'methode': 'especes', 'montant': 1000, 'montant_xof': 1000}],
            }, format='json').status_code, 201)
        s = self.c.get(f"/api/stock/sommiers/{r.data['id']}/").data
        self.assertEqual((s['quantite_restante'], s['statut']), (0, 'apure'))
