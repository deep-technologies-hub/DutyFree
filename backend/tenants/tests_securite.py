from django.conf import settings
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from configuration.models import Configuration
from fidelite.models import CarteFidelite
from stock.models import Sommier
from utilisateurs.models import Utilisateur
from ventes.models import Vente

from .tests import client_for, make_org, produit


class SecuriteRolesTests(TestCase):
    """Accès par rôle, intégrité des ventes, fidélité et protection des connexions."""

    def setUp(self):
        cache.clear()
        self.org, self.admin = make_org('alpha')
        self.p = produit(self.org, 'S-1', stock=20)
        self.caissier = Utilisateur.objects.create(organisation=self.org, username='awa', role='caissier',
                                                   register_id='CAISSE-01')
        self.stock = Utilisateur.objects.create(organisation=self.org, username='paul', role='stock_manager')

    def vente(self, user, ticket='V-1', quantite=2, **extra):
        payload = {
            'numero_ticket': ticket, 'numero_caisse': 'CAISSE-01', 'devise': 'XOF',
            'sous_total': 1000 * quantite, 'total': 1000 * quantite, 'date_locale': timezone.now().isoformat(),
            'lignes': [{'produit': self.p.id, 'quantite': quantite, 'prix_unitaire': 1000, 'total': 1000 * quantite}],
            'paiements': [{'methode': 'especes', 'montant': 1000 * quantite, 'montant_xof': 1000 * quantite}],
            **extra,
        }
        return client_for(user).post('/api/ventes/', payload, format='json')

    def test_caissier_lit_le_catalogue_sans_pouvoir_le_modifier(self):
        c = client_for(self.caissier)
        self.assertEqual(c.get('/api/stock/produits/').status_code, 200)
        self.assertEqual(c.patch(f'/api/stock/produits/{self.p.id}/', {'prix_xof': 1}, format='json').status_code, 403)
        self.assertEqual(c.get('/api/stock/sommiers/').status_code, 403)
        mouvement = {'produit': self.p.id, 'type_mouvement': 'entree', 'quantite': 5}
        self.assertEqual(c.post('/api/stock/mouvements/', mouvement, format='json').status_code, 403)
        self.assertEqual(c.get('/api/utilisateurs/').status_code, 403)
        self.assertEqual(c.get('/api/ventes/dashboard/').status_code, 403)
        self.assertEqual(c.get('/api/configuration/').status_code, 200)

    def test_gestionnaire_stock_sans_acces_aux_ventes(self):
        c = client_for(self.stock)
        self.assertEqual(c.get('/api/ventes/').status_code, 403)
        mouvement = {'produit': self.p.id, 'type_mouvement': 'entree', 'quantite': 5}
        self.assertEqual(c.post('/api/stock/mouvements/', mouvement, format='json').status_code, 201)

    def test_vente_ni_modifiable_ni_supprimable(self):
        r = self.vente(self.caissier)
        self.assertEqual(r.status_code, 201, r.data)
        vid = Vente.objects.get(numero_ticket='V-1').id
        for c in (client_for(self.caissier), client_for(self.admin)):
            self.assertEqual(c.delete(f'/api/ventes/{vid}/').status_code, 405)
            self.assertEqual(c.patch(f'/api/ventes/{vid}/', {'total': 1}, format='json').status_code, 405)

    def test_vente_incoherente_refusee(self):
        self.assertEqual(self.vente(self.caissier, 'V-0', quantite=0).status_code, 400)
        r = self.vente(self.caissier, 'V-2', statut='annulee')
        self.assertEqual(Vente.objects.get(numero_ticket='V-2').statut, 'payee', r.data)

    def test_caissier_ne_voit_que_ses_ventes(self):
        self.vente(self.caissier, 'V-C')
        self.vente(self.admin, 'V-A')
        tickets = [v['numero_ticket'] for v in client_for(self.caissier).get('/api/ventes/').data['results']]
        self.assertEqual(tickets, ['V-C'])

    def test_annulation_remet_en_stock_et_retablit_le_sommier(self):
        som = Sommier.objects.create(organisation=self.org, numero='SOM-1', produit=self.p,
                                     quantite_initiale=20, statut='actif',
                                     date_ouverture=timezone.now().date())
        self.vente(self.caissier, 'V-1', quantite=3)
        self.p.refresh_from_db()
        som.refresh_from_db()
        self.assertEqual((self.p.stock, som.quantite_sortie), (17, 3))
        url = f"/api/ventes/{Vente.objects.get(numero_ticket='V-1').id}/annuler/"

        self.assertEqual(client_for(self.caissier).post(url, {'motif': 'x'}).status_code, 403)
        self.assertEqual(client_for(self.admin).post(url, {}).status_code, 400)  # motif obligatoire
        r = client_for(self.admin).post(url, {'motif': 'Erreur de saisie'})
        self.assertEqual(r.status_code, 200, r.data)
        self.p.refresh_from_db()
        som.refresh_from_db()
        self.assertEqual((self.p.stock, som.quantite_sortie, r.data['statut']), (20, 0, 'annulee'))
        self.assertEqual(client_for(self.admin).post(url, {'motif': 'x'}).status_code, 400)  # déjà annulée

    def test_stock_non_modifiable_par_la_fiche_produit(self):
        r = client_for(self.admin).patch(f'/api/stock/produits/{self.p.id}/', {'stock': 999, 'nom': 'Renommé'},
                                         format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.p.refresh_from_db()
        self.assertEqual((self.p.stock, self.p.nom), (20, 'Renommé'))

    def test_points_fidelite_uniquement_sur_une_vente_reelle(self):
        carte = CarteFidelite.objects.create(organisation=self.org, numero='DF1', nom='Ka', prenom='Ali')
        c = client_for(self.caissier)
        url = f'/api/fidelite/{carte.id}/ajouter_points/'
        self.assertEqual(c.post(url, {'montant_xof': 1000000}, format='json').status_code, 400)
        self.assertEqual(c.post(url, {'montant_xof': 1000000, 'reference': 'INCONNU'}, format='json').status_code, 400)
        self.vente(self.caissier, 'V-F', quantite=2)
        r = c.post(url, {'montant_xof': 1000000, 'reference': 'V-F'}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        carte.refresh_from_db()
        attendu = round(2000 * float(Configuration.get(self.org).points_par_xof), 2)
        self.assertEqual(float(carte.points), attendu)  # montant de la vente, pas celui envoyé
        self.assertEqual(c.post(url, {'reference': 'V-F'}, format='json').status_code, 400)  # une seule fois
        self.assertEqual(c.get('/api/fidelite/').status_code, 403)

    def test_vente_avec_carte_credite_les_points(self):
        carte = CarteFidelite.objects.create(organisation=self.org, numero='DF2', nom='Ka', prenom='Ali')
        r = self.vente(self.caissier, 'V-G', quantite=1, carte_fidelite=carte.id)
        self.assertEqual(r.status_code, 201, r.data)
        carte.refresh_from_db()
        self.assertGreater(float(carte.points), 0)

    def test_pin_reserve_aux_caissiers(self):
        self.admin.set_pin('1234')
        self.admin.save()
        r = APIClient().post('/api/auth/token/', {'organisation': 'alpha', 'username': 'admin', 'password': '1234'},
                             format='json')
        self.assertEqual(r.status_code, 401)

    def test_compte_bloque_apres_trop_d_echecs(self):
        self.caissier.set_pin('4321')
        self.caissier.save()
        c = APIClient()
        identifiants = {'organisation': 'alpha', 'username': 'awa'}
        for _ in range(settings.LOGIN_MAX_ECHECS):
            c.post('/api/auth/token/', {**identifiants, 'password': '0000'}, format='json')
        r = c.post('/api/auth/token/', {**identifiants, 'password': '4321'}, format='json')
        self.assertEqual(r.status_code, 401)
        self.assertEqual(r.data['code'], 'account_locked')
        cache.clear()
        self.assertEqual(c.post('/api/auth/token/', {**identifiants, 'password': '4321'}, format='json').status_code, 200)
