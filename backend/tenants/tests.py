from datetime import timedelta
from decimal import Decimal

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from stock.models import Produit
from tenants.models import Facture, Organisation, Plan
from tenants.services import creer_organisation
from utilisateurs.models import Utilisateur
from ventes.models import Vente

PASSWORD = 'MotDePasse-Solide-2025'


def make_org(slug, plan_code='business'):
    plan = Plan.objects.get(code=plan_code)
    org, admin = creer_organisation(
        nom=f'Boutique {slug}', slug=slug, email=f'{slug}@example.com', plan=plan,
        admin={'username': 'admin', 'password': PASSWORD},
    )
    return org, admin


def client_for(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def produit(org, code='P-1', **kw):
    return Produit.objects.create(organisation=org, code=code, nom=f'Produit {code}',
                                  prix_xof=1000, stock=kw.pop('stock', 10), **kw)


class InscriptionEtConnexionTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_inscription_cree_organisation_admin_et_tokens(self):
        r = APIClient().post('/api/saas/inscription/', {
            'nom_organisation': 'Duty Free Abidjan', 'email': 'contact@dfa.ci', 'plan': 'starter',
            'admin_username': 'patron', 'admin_password': PASSWORD,
        }, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertIn('access', r.data)
        org = Organisation.objects.get(slug=r.data['organisation']['slug'])
        self.assertEqual(org.statut, 'essai')
        self.assertTrue(org.est_active)
        self.assertEqual(org.configuration.nom_boutique, 'Duty Free Abidjan')
        self.assertEqual(org.utilisateurs.get().role, 'admin')

    def test_slug_deja_pris_refuse(self):
        make_org('alpha')
        r = APIClient().post('/api/saas/inscription/', {
            'nom_organisation': 'X', 'slug': 'alpha', 'email': 'x@x.com', 'plan': 'starter',
            'admin_username': 'admin', 'admin_password': PASSWORD,
        }, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('slug', r.data)

    def test_connexion_par_code_entreprise_meme_identifiant_dans_deux_orgs(self):
        make_org('alpha')
        make_org('beta')
        c = APIClient()
        r = c.post('/api/auth/token/', {'organisation': 'beta', 'username': 'admin', 'password': PASSWORD}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
        me = c.get('/api/utilisateurs/me/').data
        self.assertEqual(me['organisation']['slug'], 'beta')

    def test_connexion_mauvaise_organisation_ou_sans_code(self):
        make_org('alpha')
        c = APIClient()
        self.assertEqual(c.post('/api/auth/token/', {'organisation': 'inconnue', 'username': 'admin',
                                                     'password': PASSWORD}, format='json').status_code, 401)
        self.assertEqual(c.post('/api/auth/token/', {'username': 'admin', 'password': PASSWORD},
                                format='json').status_code, 401)

    def test_connexion_caissier_par_pin_hache(self):
        org, _ = make_org('alpha')
        u = Utilisateur(organisation=org, username='awa', role='caissier', register_id='CAISSE-01')
        u.set_password(PASSWORD)
        u.set_pin('4321')
        u.save()
        self.assertNotEqual(u.pin, '4321')
        c = APIClient()
        r = c.post('/api/auth/token/', {'organisation': 'alpha', 'username': 'CAISSE-01', 'password': '4321'}, format='json')
        self.assertEqual(r.status_code, 200)
        r = c.post('/api/auth/token/', {'organisation': 'alpha', 'username': 'awa', 'password': '0000'}, format='json')
        self.assertEqual(r.status_code, 401)

    def test_organisation_suspendue_ne_peut_pas_se_connecter(self):
        org, _ = make_org('alpha')
        org.statut = 'suspendu'
        org.save()
        r = APIClient().post('/api/auth/token/', {'organisation': 'alpha', 'username': 'admin', 'password': PASSWORD}, format='json')
        self.assertEqual(r.status_code, 401)

    def test_liste_publique_des_caissiers_par_organisation(self):
        a, _ = make_org('alpha')
        b, _ = make_org('beta')
        Utilisateur.objects.create(organisation=a, username='ca', role='caissier')
        Utilisateur.objects.create(organisation=b, username='cb', role='caissier')
        r = APIClient().get('/api/utilisateurs/caissiers/?organisation=alpha')
        self.assertEqual([u['username'] for u in r.data], ['ca'])
        self.assertEqual(APIClient().get('/api/utilisateurs/caissiers/').status_code, 400)


class IsolationTests(TestCase):
    def setUp(self):
        self.a, self.admin_a = make_org('alpha')
        self.b, self.admin_b = make_org('beta')
        self.pa = produit(self.a, 'A-1')
        self.pb = produit(self.b, 'B-1')

    def test_listes_et_details_filtres(self):
        c = client_for(self.admin_a)
        codes = [p['code'] for p in c.get('/api/stock/produits/').data['results']]
        self.assertEqual(codes, ['A-1'])
        self.assertEqual(c.get(f'/api/stock/produits/{self.pb.id}/').status_code, 404)
        self.assertEqual(c.patch(f'/api/stock/produits/{self.pb.id}/', {'nom': 'pirate'}, format='json').status_code, 404)
        self.assertEqual(len(c.get('/api/stock/categories/').data['results']), 7)

    def test_impossible_de_referencer_un_objet_d_une_autre_organisation(self):
        c = client_for(self.admin_a)
        r = c.post('/api/stock/mouvements/', {'produit': self.pb.id, 'type_mouvement': 'entree', 'quantite': 5}, format='json')
        self.assertEqual(r.status_code, 400)
        self.pb.refresh_from_db()
        self.assertEqual(self.pb.stock, 10)

        cat_b = self.b.stock_categorie_set.first()
        r = c.post('/api/stock/produits/', {'code': 'A-2', 'nom': 'x', 'prix_xof': 10, 'categorie': cat_b.id}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_organisation_non_modifiable_par_le_client(self):
        c = client_for(self.admin_a)
        r = c.post('/api/stock/fournisseurs/', {'nom': 'F', 'organisation': self.b.id}, format='json')
        self.assertEqual(r.status_code, 201)
        self.assertEqual(self.a.stock_fournisseur_set.count(), 1)
        self.assertEqual(self.b.stock_fournisseur_set.count(), 0)

    def test_codes_uniques_par_organisation(self):
        c = client_for(self.admin_a)
        # Même code qu'un produit d'une autre organisation : autorisé
        self.assertEqual(c.post('/api/stock/produits/', {'code': 'B-1', 'nom': 'x', 'prix_xof': 10}, format='json').status_code, 201)
        # Doublon dans la même organisation : 400 (et non 500)
        self.assertEqual(c.post('/api/stock/produits/', {'code': 'A-1', 'nom': 'x', 'prix_xof': 10}, format='json').status_code, 400)
        # Code-barres vide : plusieurs produits autorisés
        self.assertEqual(c.post('/api/stock/produits/', {'code': 'A-3', 'nom': 'x', 'prix_xof': 10, 'code_barres': ''}, format='json').status_code, 201)

    def test_vente_decremente_le_stock_et_reste_isolee(self):
        payload = {
            'numero_ticket': 'T-0001', 'numero_caisse': 'CAISSE-01', 'devise': 'XOF',
            'sous_total': 2000, 'total': 2000, 'date_locale': timezone.now().isoformat(),
            'lignes': [{'produit': self.pa.id, 'quantite': 2, 'prix_unitaire': 1000, 'total': 2000}],
            'paiements': [{'methode': 'especes', 'montant': 2000, 'montant_xof': 2000}],
        }
        r = client_for(self.admin_a).post('/api/ventes/', payload, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.pa.refresh_from_db()
        self.assertEqual(self.pa.stock, 8)
        # Même numéro de ticket dans une autre organisation : autorisé
        payload['lignes'][0]['produit'] = self.pb.id
        self.assertEqual(client_for(self.admin_b).post('/api/ventes/', payload, format='json').status_code, 201)
        # Produit d'une autre organisation dans la vente : refusé
        payload['numero_ticket'] = 'T-0002'
        self.assertEqual(client_for(self.admin_a).post('/api/ventes/', payload, format='json').status_code, 400)

        dash = client_for(self.admin_a).get('/api/ventes/dashboard/').data
        self.assertEqual(dash['tickets_today'], 1)
        self.assertEqual(Vente.objects.filter(organisation=self.b).count(), 1)

    def test_sync_offline_idempotente(self):
        vente = {
            'numero_ticket': 'OFF-1', 'numero_caisse': 'C1', 'devise': 'XOF', 'sous_total': 1000, 'total': 1000,
            'date_locale': timezone.now().isoformat(),
            'lignes': [{'produit': self.pa.id, 'quantite': 1, 'prix_unitaire': 1000, 'total': 1000}],
            'paiements': [{'methode': 'especes', 'montant': 1000, 'montant_xof': 1000}],
        }
        c = client_for(self.admin_a)
        self.assertEqual(c.post('/api/ventes/sync_offline/', {'ventes': [vente]}, format='json').data['synced'], 1)
        self.assertEqual(c.post('/api/ventes/sync_offline/', {'ventes': [vente]}, format='json').data['synced'], 1)
        self.pa.refresh_from_db()
        self.assertEqual(self.pa.stock, 9)

    def test_configuration_par_organisation(self):
        client_for(self.admin_a).patch('/api/configuration/', {'nom_boutique': 'Alpha Shop'}, format='json')
        self.assertEqual(client_for(self.admin_b).get('/api/configuration/').data['nom_boutique'], 'Boutique beta')

    def test_commande_avec_lignes(self):
        c = client_for(self.admin_a)
        f = c.post('/api/stock/fournisseurs/', {'nom': 'F'}, format='json').data
        r = c.post('/api/stock/commandes/', {'fournisseur': f['id'], 'lignes': [
            {'produit': self.pa.id, 'quantite': 3, 'prix_unitaire': 500}]}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(Decimal(str(r.data['montant_total'])), Decimal('1500'))
        r = c.post('/api/stock/commandes/', {'fournisseur': f['id'], 'lignes': [
            {'produit': self.pb.id, 'quantite': 3, 'prix_unitaire': 500}]}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_endpoints_actions_stock(self):
        c = client_for(self.admin_a)
        produit(self.a, 'A-0', stock=0, code_barres='123')
        self.assertEqual(c.get('/api/stock/produits/stats/').data['ruptures'], 1)
        self.assertEqual(len(c.get('/api/stock/produits/alertes/').data['ruptures']), 1)
        self.assertEqual(c.get('/api/stock/produits/par_barcode/?code=123').status_code, 200)
        self.assertEqual(client_for(self.admin_b).get('/api/stock/produits/par_barcode/?code=123').status_code, 404)


class RolesEtQuotasTests(TestCase):
    def setUp(self):
        self.org, self.admin = make_org('alpha', plan_code='starter')

    def test_seul_admin_gere_les_utilisateurs(self):
        caissier = Utilisateur.objects.create(organisation=self.org, username='c', role='caissier')
        r = client_for(caissier).post('/api/utilisateurs/', {'username': 'x', 'password': PASSWORD, 'role': 'admin'}, format='json')
        self.assertEqual(r.status_code, 403)

    def test_admin_cree_utilisateur_avec_pin_et_mot_de_passe_haches(self):
        r = client_for(self.admin).post('/api/utilisateurs/', {
            'username': 'awa', 'password': PASSWORD, 'pin': '1234', 'role': 'caissier', 'register_id': 'CAISSE-01'},
            format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertNotIn('pin', r.data)
        u = Utilisateur.objects.get(username='awa')
        self.assertTrue(u.check_pin('1234'))
        self.assertTrue(u.check_password(PASSWORD))
        # Réinitialisation du PIN via PATCH
        client_for(self.admin).patch(f'/api/utilisateurs/{u.id}/', {'pin': '9876'}, format='json')
        u.refresh_from_db()
        self.assertTrue(u.check_pin('9876'))

    def test_quota_caisses(self):
        c = client_for(self.admin)
        ok = c.post('/api/utilisateurs/', {'username': 'c1', 'password': PASSWORD, 'role': 'caissier', 'register_id': 'CAISSE-01'}, format='json')
        self.assertEqual(ok.status_code, 201)
        # Deuxième caissier sur la même caisse : autorisé
        self.assertEqual(c.post('/api/utilisateurs/', {'username': 'c2', 'password': PASSWORD, 'role': 'caissier', 'register_id': 'CAISSE-01'}, format='json').status_code, 201)
        # Nouvelle caisse au-delà du plan Starter (1 caisse) : refusé
        r = c.post('/api/utilisateurs/', {'username': 'c3', 'password': PASSWORD, 'role': 'caissier', 'register_id': 'CAISSE-02'}, format='json')
        self.assertEqual(r.status_code, 403)

    def test_quota_produits(self):
        self.org.plan.max_produits = 1
        self.org.plan.save()
        c = client_for(self.admin)
        self.assertEqual(c.post('/api/stock/produits/', {'code': '1', 'nom': 'x', 'prix_xof': 1}, format='json').status_code, 201)
        r = c.post('/api/stock/produits/', {'code': '2', 'nom': 'x', 'prix_xof': 1}, format='json')
        self.assertEqual(r.status_code, 403)
        self.assertEqual(r.data['detail'].code, 'plan_limit_reached')

    def test_admin_ne_peut_pas_se_desactiver(self):
        r = client_for(self.admin).patch(f'/api/utilisateurs/{self.admin.id}/', {'is_active': False}, format='json')
        self.assertEqual(r.status_code, 400)


class AbonnementTests(TestCase):
    def setUp(self):
        self.org, self.admin = make_org('alpha', plan_code='starter')
        self.org.essai_fin = timezone.now() - timedelta(days=1)
        self.org.save()

    def test_essai_expire_lecture_seule(self):
        c = client_for(self.admin)
        self.assertEqual(c.get('/api/stock/produits/').status_code, 200)
        r = c.post('/api/stock/fournisseurs/', {'nom': 'F'}, format='json')
        self.assertEqual(r.status_code, 402)
        self.assertEqual(c.get('/api/saas/organisation/').data['est_active'], False)

    def test_souscription_puis_paiement_reactive(self):
        c = client_for(self.admin)
        r = c.post('/api/saas/factures/souscrire/', {'plan': 'business', 'mois': 3}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(Decimal(r.data['facture']['montant_xof']), Decimal('180000'))
        facture = Facture.objects.get(pk=r.data['facture']['id'])
        facture.marquer_payee(methode='mobile_money', reference='OM-123')
        self.org.refresh_from_db()
        self.assertEqual(self.org.statut, 'actif')
        self.assertEqual(self.org.plan.code, 'business')
        self.assertGreater(self.org.periode_fin, timezone.now() + timedelta(days=85))
        self.assertEqual(c.post('/api/stock/fournisseurs/', {'nom': 'F'}, format='json').status_code, 201)
        # Idempotent
        fin = self.org.periode_fin
        facture.marquer_payee()
        self.org.refresh_from_db()
        self.assertEqual(self.org.periode_fin, fin)

    def test_factures_reservees_admin_et_isolees(self):
        autre, autre_admin = make_org('beta')
        Facture.objects.create(organisation=autre, plan=autre.plan, montant_xof=1)
        self.assertEqual(client_for(self.admin).get('/api/saas/factures/').data['count'], 0)
        caissier = Utilisateur.objects.create(organisation=self.org, username='c', role='caissier')
        self.assertEqual(client_for(caissier).get('/api/saas/factures/').status_code, 403)

    def test_plans_publics(self):
        r = APIClient().get('/api/saas/plans/')
        self.assertEqual([p['code'] for p in r.data], ['starter', 'business', 'enterprise'])

    def test_compte_plateforme_sans_organisation_refuse_sur_api_metier(self):
        root = Utilisateur.objects.create_superuser(username='root', password=PASSWORD, email='r@x.com')
        self.assertEqual(client_for(root).get('/api/stock/produits/').status_code, 403)
