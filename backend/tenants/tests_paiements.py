import re
from datetime import timedelta
from io import StringIO
from unittest import mock

from django.core import mail
from django.core.cache import cache
from django.core.management import call_command
from django.test import Client, TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from tenants.models import Facture, PaiementEvenement
from tenants.paiements import CinetPay
from tenants.tests import PASSWORD, client_for, make_org

URLS = dict(PUBLIC_URL='http://api.test', FRONTEND_URL='http://app.test')


@override_settings(EMAIL_ASYNC=False, PAYMENT_PROVIDER='simulateur', PAYMENT_SIMULATEUR_AUTORISE=True, **URLS)
class PaiementSimulateurTests(TestCase):
    def setUp(self):
        self.org, self.admin = make_org('alpha', plan_code='starter')
        self.c = client_for(self.admin)
        self.web = APIClient()

    def _facture(self):
        return self.c.post('/api/saas/factures/souscrire/', {'plan': 'business', 'mois': 1}, format='json').data['facture']

    def test_parcours_complet_paiement_reussi(self):
        facture = self._facture()
        r = self.c.post(f"/api/saas/factures/{facture['id']}/payer/")
        self.assertEqual(r.status_code, 200, r.data)
        chemin = r.data['url'].replace('http://api.test', '')
        self.assertEqual(self.web.get(chemin).status_code, 200)

        mail.outbox.clear()
        with self.captureOnCommitCallbacks(execute=True):
            r = self.web.post(chemin, {'choix': 'mobile_money'})
        self.assertEqual(r.status_code, 302)
        r = self.web.get(r['Location'].replace('http://api.test', ''))
        self.assertEqual(r['Location'], f"http://app.test/abonnement?facture={facture['id']}&paiement=payee")

        self.org.refresh_from_db()
        self.assertEqual((self.org.statut, self.org.plan.code), ('actif', 'business'))
        self.assertTrue(any('Paiement reçu' in m.subject for m in mail.outbox))
        self.assertEqual(Facture.objects.get(pk=facture['id']).methode, 'mobile_money')

    def test_paiement_refuse_ne_change_rien(self):
        facture = self._facture()
        chemin = self.c.post(f"/api/saas/factures/{facture['id']}/payer/").data['url'].replace('http://api.test', '')
        self.web.post(chemin, {'choix': 'echec'})
        self.assertEqual(Facture.objects.get(pk=facture['id']).statut, 'en_attente')
        self.org.refresh_from_db()
        self.assertEqual(self.org.statut, 'essai')

    def test_lien_falsifie_refuse(self):
        self.assertEqual(self.web.get('/api/saas/paiements/simulateur/faux-jeton/').status_code, 400)

    @override_settings(PAYMENT_SIMULATEUR_AUTORISE=False)
    def test_simulateur_desactivable_en_production(self):
        facture = self._facture()
        self.assertEqual(self.c.post(f"/api/saas/factures/{facture['id']}/payer/").status_code, 503)

    def test_facture_d_une_autre_organisation_inaccessible(self):
        facture = self._facture()
        _, autre_admin = make_org('beta')
        self.assertEqual(client_for(autre_admin).post(f"/api/saas/factures/{facture['id']}/payer/").status_code, 404)


@override_settings(EMAIL_ASYNC=False, PAYMENT_PROVIDER='cinetpay', PAYMENT_SIMULATEUR_AUTORISE=False,
                   CINETPAY_API_KEY='k', CINETPAY_SITE_ID='s', **URLS)
class PaiementCinetPayTests(TestCase):
    def setUp(self):
        self.org, self.admin = make_org('alpha', plan_code='starter')
        c = client_for(self.admin)
        self.facture_id = c.post('/api/saas/factures/souscrire/', {'plan': 'starter', 'mois': 1}, format='json').data['facture']['id']
        with mock.patch.object(CinetPay, '_post', return_value={'code': '201', 'data': {'payment_url': 'https://checkout.cinetpay.com/x'}}) as post:
            r = c.post(f'/api/saas/factures/{self.facture_id}/payer/')
        self.assertEqual(r.data['url'], 'https://checkout.cinetpay.com/x')
        envoye = post.call_args[0][1]
        self.assertEqual(envoye['amount'], 25000)
        self.assertEqual(envoye['notify_url'], 'http://api.test/api/saas/paiements/webhook/cinetpay/')
        self.facture = Facture.objects.get(pk=self.facture_id)

    def _webhook(self, reponse_check):
        with mock.patch.object(CinetPay, '_post', return_value=reponse_check):
            return APIClient().post('/api/saas/paiements/webhook/cinetpay/', {'cpm_trans_id': self.facture.transaction_id})

    def test_webhook_verifie_puis_encaisse_une_seule_fois(self):
        ok = {'code': '00', 'data': {'status': 'ACCEPTED', 'amount': '25000', 'currency': 'XOF', 'operator_id': 'OM-42'}}
        self.assertEqual(self._webhook(ok).status_code, 200)
        self.facture.refresh_from_db()
        self.assertEqual((self.facture.statut, self.facture.reference_paiement), ('payee', 'OM-42'))
        fin = self.facture.periode_fin
        self._webhook(ok)  # notification rejouée
        self.facture.refresh_from_db()
        self.assertEqual(self.facture.periode_fin, fin)

    def test_montant_falsifie_refuse(self):
        self._webhook({'code': '00', 'data': {'status': 'ACCEPTED', 'amount': '5', 'currency': 'XOF'}})
        self.facture.refresh_from_db()
        self.assertEqual(self.facture.statut, 'en_attente')

    def test_notification_seule_ne_suffit_pas(self):
        """Une fausse notification « payée » est ignorée si le prestataire dit le contraire."""
        self._webhook({'code': '662', 'data': {'status': 'WAITING_CUSTOMER_PAYMENT'}})
        self.facture.refresh_from_db()
        self.assertEqual(self.facture.statut, 'en_attente')
        self.assertTrue(PaiementEvenement.objects.filter(facture=self.facture, type='webhook').exists())


@override_settings(EMAIL_ASYNC=False, SAAS_RAPPEL_JOURS=7, **URLS)
class RenouvellementTests(TestCase):
    def test_facture_de_renouvellement_et_relances(self):
        org, _ = make_org('alpha', plan_code='business')
        org.essai_fin = timezone.now() + timedelta(days=3)
        org.save()
        loin, _ = make_org('beta')  # échéance dans 14 jours : rien à faire

        mail.outbox.clear()
        call_command('taches_quotidiennes', stdout=StringIO())
        facture = org.factures.get()
        self.assertEqual((facture.mois, int(facture.montant_xof)), (1, 60000))
        self.assertEqual(len(mail.outbox), 1)
        self.assertFalse(loin.factures.exists())

        call_command('taches_quotidiennes', stdout=StringIO())  # le lendemain : pas de doublon ni de spam
        self.assertEqual(org.factures.count(), 1)
        self.assertEqual(len(mail.outbox), 1)

    def test_expiration(self):
        org, _ = make_org('alpha')
        org.essai_fin = timezone.now() - timedelta(days=1)
        org.save()
        call_command('taches_quotidiennes', stdout=StringIO())
        org.refresh_from_db()
        self.assertEqual(org.statut, 'expire')


@override_settings(EMAIL_ASYNC=False, **URLS)
class SecuriteTests(TestCase):
    def setUp(self):
        cache.clear()
        self.org, self.admin = make_org('alpha')
        self.admin.email = 'patron@alpha.test'
        self.admin.save()

    def _login(self, password=PASSWORD):
        return APIClient().post('/api/auth/token/', {'organisation': 'alpha', 'username': 'admin', 'password': password}, format='json')

    def test_email_de_bienvenue(self):
        mail.outbox.clear()
        APIClient().post('/api/saas/inscription/', {
            'nom_organisation': 'Gamma', 'email': 'g@g.test', 'plan': 'starter',
            'admin_username': 'admin', 'admin_password': PASSWORD}, format='json')
        self.assertIn('Code entreprise : gamma', mail.outbox[0].body)

    def test_deconnexion_revoque_le_refresh_token(self):
        tokens = self._login().data
        c = APIClient()
        self.assertEqual(c.post('/api/auth/logout/', {'refresh': tokens['refresh']}, format='json').status_code, 200)
        self.assertEqual(c.post('/api/auth/token/refresh/', {'refresh': tokens['refresh']}, format='json').status_code, 401)

    def test_refresh_token_usage_unique(self):
        refresh = self._login().data['refresh']
        c = APIClient()
        self.assertEqual(c.post('/api/auth/token/refresh/', {'refresh': refresh}, format='json').status_code, 200)
        self.assertEqual(c.post('/api/auth/token/refresh/', {'refresh': refresh}, format='json').status_code, 401)

    def test_mot_de_passe_oublie(self):
        ancien = self._login().data['refresh']
        c = APIClient()
        mail.outbox.clear()
        r = c.post('/api/auth/mot-de-passe/oublie/', {'organisation': 'alpha', 'email': 'patron@alpha.test'}, format='json')
        self.assertEqual(r.status_code, 200)
        # Réponse identique pour un email inconnu (pas d'énumération de comptes)
        r2 = c.post('/api/auth/mot-de-passe/oublie/', {'organisation': 'alpha', 'email': 'inconnu@x.test'}, format='json')
        self.assertEqual(r.data, r2.data)
        self.assertEqual(len(mail.outbox), 1)

        uid, token = re.search(r'uid=([\w-]+)&token=([\w-]+)', mail.outbox[0].body).groups()
        nouveau = 'Nouveau-Secret-2026'
        r = c.post('/api/auth/mot-de-passe/reinitialiser/', {'uid': uid, 'token': token, 'password': nouveau}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(self._login(nouveau).status_code, 200)
        self.assertEqual(c.post('/api/auth/token/refresh/', {'refresh': ancien}, format='json').status_code, 401)
        # Lien à usage unique
        r = c.post('/api/auth/mot-de-passe/reinitialiser/', {'uid': uid, 'token': token, 'password': 'Encore-Autre-2026'}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_suspension_immediate(self):
        access = self._login().data['access']
        self.org.statut = 'suspendu'
        self.org.save()
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')
        self.assertEqual(c.get('/api/stock/produits/').status_code, 403)

    def test_requetes_sql_par_appel(self):
        """Utilisateur + organisation + plan chargés en une requête."""
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {self._login().data['access']}")
        with self.assertNumQueries(2):  # auth : utilisateur+organisation+plan (1) + comptage (1, liste vide)
            c.get('/api/stock/fournisseurs/')


@override_settings(EMAIL_ASYNC=False, **URLS)
class OperateurTests(TestCase):
    """Console superadministrateur : activation manuelle et tableau de bord."""

    OP = 'Operateur-2026!'

    def setUp(self):
        from utilisateurs.models import Utilisateur
        self.org, _ = make_org('alpha', plan_code='starter')
        self.org.essai_fin = timezone.now() - timedelta(days=1)  # essai expiré
        self.org.save()
        Utilisateur.objects.create_superuser(username='op', email='op@test', password=self.OP)
        self.client = Client()

    def _login_op(self):
        self.assertTrue(self.client.login(username='op', password=self.OP))

    def test_offrir_des_mois_active_et_laisse_une_trace(self):
        self._login_op()
        # follow=False : l'action renvoie une redirection (pas de rendu de gabarit)
        r = self.client.post('/admin/tenants/organisation/', {
            'action': 'offrir_3_mois', '_selected_action': [str(self.org.pk)],
        })
        self.assertEqual(r.status_code, 302)
        self.org.refresh_from_db()
        self.assertEqual(self.org.statut, 'actif')
        self.assertTrue(self.org.est_active)
        self.assertGreater(self.org.jours_restants, 85)
        facture = self.org.factures.get()
        self.assertEqual((facture.statut, int(facture.montant_xof)), ('payee', 0))
        self.assertIn('Offert par op', facture.reference_paiement)

    def test_tableau_de_bord_accessible_a_l_operateur(self):
        from django.contrib.admin.sites import site
        from django.test import RequestFactory
        from utilisateurs.models import Utilisateur
        from tenants.admin import OrganisationAdmin
        from tenants.models import Organisation
        req = RequestFactory().get('/admin/tenants/organisation/tableau-de-bord/')
        req.user = Utilisateur.objects.get(username='op')
        resp = OrganisationAdmin(Organisation, site).tableau_de_bord(req)
        self.assertEqual(resp.status_code, 200)
        self.assertIn('alpha', [r['slug'] for r in resp.context_data['rows']])

    def test_admin_de_boutique_na_pas_acces_a_la_console(self):
        """Un administrateur de boutique n'est pas is_staff : /admin/ le redirige vers le login."""
        self.client.login(username='admin', password=PASSWORD, organisation='alpha')
        r = self.client.get('/admin/tenants/organisation/tableau-de-bord/')
        self.assertIn(r.status_code, (302, 403))
        r = self.client.get('/admin/')
        self.assertIn(r.status_code, (302, 403))
