# Duty Free Manager

Logiciel de gestion de boutiques **duty free**, proposé en **SaaS multi-tenant** : une seule installation sert plusieurs boutiques clientes, chacune isolée dans sa propre organisation.

Il couvre toute la chaîne : caisse multi-devises (hors ligne possible), stock en temps réel, commandes fournisseurs, sommiers douaniers, programme de fidélité, reporting et taux de capture passagers.

---

## Sommaire

1. [Fonctionnalités](#fonctionnalités)
2. [Architecture](#architecture)
3. [Modèle SaaS](#modèle-saas)
4. [Démarrage rapide (Docker)](#démarrage-rapide-docker)
5. [Développement local](#développement-local)
6. [Configuration (.env)](#configuration-env)
7. [Rôles et accès](#rôles-et-accès)
8. [Exploitation de la plateforme](#exploitation-de-la-plateforme)
9. [API](#api)
10. [Sécurité et performances](#sécurité-et-performances)
11. [Mise en production](#mise-en-production)
12. [Migration d'une installation existante](#migration-dune-installation-existante)
13. [Tests](#tests)
14. [Dépannage](#dépannage)

---

## Fonctionnalités

| Application | Pour qui | Fonctionnalités |
|---|---|---|
| **Backoffice** | Direction, superviseurs, admin | Tableau de bord temps réel, reporting, ventes, produits, catégories, taux de capture passagers, fidélité, utilisateurs, exports Excel/PDF, configuration, **inscription et abonnement** |
| **Caisse** | Caissiers | Connexion par PIN, scan code-barres, paniers multi-devises (XOF / EUR / USD), paiements mixtes (espèces, carte, Mobile Money), cartes fidélité, tickets (imprimante ESC/POS USB ou impression navigateur), clôture de caisse, **mode hors ligne** avec synchronisation automatique |
| **Stock** | Gestionnaires de stock | Produits, catégories, fournisseurs, commandes fournisseurs (PDF + envoi email), réception, mouvements, inventaire, sommiers douaniers, alertes de rupture en temps réel |

---

## Architecture

```
                        ┌──────────────┐
  :80  Backoffice ─┐    │              │
  :81  Caisse    ──┼──► │    nginx     │ ──► /api, /ws, /admin ──► backend (Django + Daphne)
  :82  Stock     ──┘    │              │                              │        │
                        └──────────────┘                         PostgreSQL   Redis
                                                                 (données)   (WebSockets, cache)
```

| Dossier | Technologie |
|---|---|
| `backend/` | Python 3.12, Django 5.2, Django REST Framework, SimpleJWT, Channels (WebSockets), ReportLab |
| `app-backoffice/`, `app-caisse/`, `app-stock/` | React 19, TypeScript, Vite, Zustand, Recharts |
| `docker-compose.yml`, `nginx.conf`, `nginx-backend.conf` | Déploiement : PostgreSQL 16, Redis 7, nginx |

Organisation du backend :

```
backend/
├── backend/        Configuration (settings, urls, asgi, auth WebSocket)
├── tenants/        SaaS : organisations, plans, factures, quotas, permissions, inscription
├── utilisateurs/   Utilisateurs, rôles, connexion par code entreprise + mot de passe / PIN
├── stock/          Produits, catégories, fournisseurs, sommiers, mouvements, commandes
├── ventes/         Ventes, paiements, tableau de bord, données passagers
├── fidelite/       Cartes et mouvements de points
└── configuration/  Paramètres de chaque boutique (tickets, taux de change, seuils)
```

---

## Modèle SaaS

### Organisations et isolation des données
- Chaque client est une **organisation**, identifiée par un **code entreprise** (ex. `aeroport-ouaga`). Ce code est demandé à la connexion dans les 3 applications et mémorisé sur le poste.
- Toutes les tables métier portent une colonne `organisation`. Les vues filtrent automatiquement sur l'organisation de l'utilisateur connecté, et l'API refuse toute référence à un objet d'une autre organisation (un produit, une catégorie, une carte fidélité…).
- Les identifiants (utilisateur, code produit, n° de ticket…) sont uniques **par organisation** : deux boutiques peuvent avoir chacune un utilisateur `admin`.
- Les WebSockets sont authentifiés par jeton JWT et chaque boutique ne reçoit que ses propres événements.

### Offres
Créées automatiquement à l'installation, modifiables dans `/admin/` :

| Plan | Prix / mois | Caisses | Utilisateurs | Produits |
|---|---|---|---|---|
| Starter | 25 000 XOF | 1 | 5 | 300 |
| Business | 60 000 XOF | 5 | 20 | 3 000 |
| Enterprise | 150 000 XOF | illimité | illimité | illimité |

Une action qui dépasse une limite est refusée avec un message invitant à changer d'offre.

### Cycle de vie d'un abonnement
```
Inscription ──► Essai gratuit (14 j) ──► Actif (période payée + 5 j de grâce) ──► Expiré
                                              ▲                                     │
                                              └──────── facture encaissée ◄─────────┘
```
- **Expiré ou suspendu** : l'application passe en **lecture seule** (les données restent consultables). Un bandeau l'indique dans les 3 applications.
- La **caisse** continue d'enregistrer les ventes localement et les transmet automatiquement après le renouvellement : aucune vente n'est perdue.
- Une organisation **suspendue** (par l'opérateur) ne peut plus se connecter.

### Facturation et paiement en ligne
1. L'administrateur ouvre **Backoffice → Abonnement**, choisit un plan et une durée (1, 3, 6 ou 12 mois) et génère une facture (également envoyée par email).
2. **Payer maintenant** → page de paiement du prestataire (Mobile Money : Orange, Moov, Wave, MTN… ou carte).
3. Le prestataire notifie le serveur (webhook). Le serveur **revérifie la transaction auprès du prestataire** (statut, montant exact, devise) avant d'encaisser. L'abonnement est prolongé, le plan mis à jour et un reçu envoyé.
4. Au retour, le backoffice affiche la confirmation (il revérifie quelques secondes si la notification tarde).

**Renouvellement mensuel** : chaque jour, `taches_quotidiennes` crée la facture du mois suivant `SAAS_RAPPEL_JOURS` jours avant l'échéance, l'envoie aux administrateurs, puis relance tous les 3 jours jusqu'au paiement. Le Mobile Money ne permet pas le prélèvement automatique : le client paie chaque mois en un clic depuis l'email ou le backoffice.

| `PAYMENT_PROVIDER` | Usage |
|---|---|
| `simulateur` | Local / démo : page de paiement fictive, sans Internet ni clé. Désactivé automatiquement en production. |
| `cinetpay` | Production (zone UEMOA, XOF) : renseigner `CINETPAY_API_KEY` et `CINETPAY_SITE_ID`. |

Sécurité du paiement : une notification n'est jamais crue sur parole (revérification systématique), l'encaissement est idempotent (une notification rejouée ne prolonge pas deux fois), chaque tentative a un identifiant de transaction unique, et tout est journalisé (*Factures* → journal des événements dans `/admin/`). L'encaissement manuel (virement) reste possible : action « Marquer comme payée ».

> Pour tester CinetPay avant la production, le serveur doit être joignable depuis Internet (notifications) : utilisez un tunnel (`ngrok http 80`) et mettez son URL dans `PUBLIC_URL`. Le connecteur CinetPay est couvert par des tests automatisés qui simulent ses réponses, mais il n'a jamais été appelé réellement : faites un vrai paiement de test avec votre compte marchand avant d'ouvrir le service.

Ajouter un autre prestataire (Stripe, PayDunya, FedaPay…) : une classe dans `backend/tenants/paiements.py` avec `initier()`, `verifier()` et `transaction_depuis_notification()`.

---

## Démarrage rapide (Docker)

Prérequis : **Docker Desktop** démarré et une connexion Internet pour le premier build. (Pile validée de bout en bout : build, migrations, inscription, paiement simulé, emails, console opérateur.)

**Windows, en une commande :**
```powershell
powershell -ExecutionPolicy Bypass -File .\demarrer-local.ps1
```
Le script crée `.env` s'il manque, construit et lance tous les services, attend que l'API réponde, puis crée la boutique de démo et un compte opérateur. Option `-Reset` : repart d'une base vide.

**Manuellement (toutes plateformes) :**
```bash
cp .env.example .env                 # valeurs prêtes pour le local
docker compose up -d --build         # charge aussi docker-compose.override.yml (local)
docker compose exec backend python manage.py seed_database
docker compose exec backend python manage.py createsuperuser
```

| URL | Application |
|---|---|
| http://localhost | Backoffice (et `/inscription` pour créer une boutique) |
| http://localhost:81 | Caisse |
| http://localhost:82 | Stock |
| http://localhost:8025 | **Mailpit** : tous les emails envoyés en local |
| http://localhost/admin/ | Administration de la plateforme (`plateforme` / `Plateforme-Local-2025` avec le script) |

En local, `docker-compose.override.yml` active automatiquement le **paiement simulé** et **Mailpit**, et expose PostgreSQL sur `localhost:5433`.

> **Ports déjà occupés ?** Si 80/81/82 sont pris (un autre projet, un serveur web…), définis `HTTP_BACKOFFICE`, `HTTP_CAISSE`, `HTTP_STOCK` dans `.env` (ex. 8080/8081/8082). Les URLs des emails et des retours de paiement s'ajustent automatiquement. Les adresses du tableau ci-dessus utilisent alors ces ports.

Comptes de la boutique de démonstration (code entreprise **`demo`**) :

| Application | Identifiant | Mot de passe / PIN |
|---|---|---|
| Backoffice | `admin` | `dutyfree2025` |
| Caisse | Aminata Sawadogo / Issouf Compaoré | PIN `1234` / `5678` |
| Stock | `stock` | `dutyfree2025` |

Services lancés : `db` (PostgreSQL), `redis`, `backend`, `scheduler` (facturation et expirations quotidiennes), `app-backoffice`, `app-caisse`, `app-stock`, `nginx`, et `mailpit` en local.

### Scénario de test complet en local

1. **Inscription** : http://localhost/inscription → créer « Ma Boutique » sur le plan Starter.
   Un email de bienvenue avec le code entreprise arrive dans Mailpit (http://localhost:8025).
2. **Mise en place** : Backoffice → Produits (ajouter 2-3 produits), Utilisateurs (créer un caissier `CAISSE-01` avec un PIN).
3. **Vente** : http://localhost:81 → code entreprise → caissier → PIN → vendre. Le stock et le tableau de bord du backoffice se mettent à jour en temps réel.
4. **Hors ligne** : couper le réseau (outils développeur → Offline), vendre, rétablir → les ventes se synchronisent.
5. **Quota** : créer une 2ᵉ caisse sur le plan Starter → refus « Limite du plan atteinte ».
6. **Paiement** : Backoffice → Abonnement → Business, 1 mois → *Générer la facture* → *Payer maintenant* → page de paiement simulée → *Payer avec Mobile Money*. Retour automatique avec confirmation ; reçu dans Mailpit ; plan passé à Business.
   Essayez aussi *Simuler un refus*.
   Sans aucun paiement : `/admin/` → *Organisations* → cocher la boutique → action « Activer / offrir 3 mois ».
7. **Renouvellement mensuel** : dans `/admin/` → *Organisations*, mettre la fin d'essai ou d'échéance à J+3, puis
   `docker compose exec backend python manage.py taches_quotidiennes` → facture de renouvellement créée et email de rappel.
8. **Expiration** : mettre l'échéance dans le passé (au-delà du délai de grâce), relancer `taches_quotidiennes` → bandeau « lecture seule » ; la caisse garde ses ventes en file locale. Payer → tout se débloque.
9. **Mot de passe oublié** : page de connexion → lien → email dans Mailpit → nouveau mot de passe.
10. **Isolation** : créer une 2ᵉ boutique et vérifier qu'aucune donnée de la première n'est visible.

**Passer en production** : voir la [checklist](#mise-en-production).

---

## Développement local

### Backend
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows  (Linux/Mac : source .venv/bin/activate)
pip install -r requirements.txt

# Sans POSTGRES_DB dans backend/.env, SQLite est utilisé
python manage.py migrate
python manage.py seed_database    # boutique « demo »
python manage.py createsuperuser  # opérateur plateforme
python manage.py runserver        # http://localhost:8000
```
`runserver` suffit pour l'API ; les WebSockets fonctionnent aussi grâce à Daphne (installé comme app Django). Sans `REDIS_URL`, une couche mémoire est utilisée (un seul processus).

### Frontends
Dans chaque dossier `app-backoffice`, `app-caisse`, `app-stock` :
```bash
cp .env.example .env    # VITE_API_URL=http://localhost:8000/api
npm install
npm run dev
```

---

## Configuration (.env)

| Variable | Défaut | Rôle |
|---|---|---|
| `DEBUG` | `False` | Mode développement |
| `SECRET_KEY` | — | **Obligatoire en production** (le serveur refuse de démarrer sans) |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1` | Noms de domaine servis |
| `CORS_ALLOWED_ORIGINS` / `CSRF_TRUSTED_ORIGINS` | ports locaux | Origines des frontends |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_PORT` | — | PostgreSQL (SQLite si `POSTGRES_DB` est vide) |
| `REDIS_URL` | — | Redis pour WebSockets et cache (défini automatiquement par Docker) |
| `USE_HTTPS` | `False` | Cookies sécurisés + HSTS derrière un proxy TLS |
| `SAAS_TRIAL_DAYS` | `14` | Durée de l'essai gratuit |
| `SAAS_GRACE_DAYS` | `5` | Délai de grâce après l'échéance |
| `SAAS_PAYMENT_INSTRUCTIONS` | texte | Moyen de paiement alternatif affiché au client |
| `SAAS_RAPPEL_JOURS` | `7` | Création de la facture de renouvellement N jours avant l'échéance |
| `PAYMENT_PROVIDER` | `simulateur` | `simulateur` ou `cinetpay` |
| `CINETPAY_API_KEY`, `CINETPAY_SITE_ID` | — | Compte marchand CinetPay |
| `PUBLIC_URL` | `http://localhost:8000` | URL publique de l'API (notifications et retours de paiement) |
| `FRONTEND_URL`, `CAISSE_URL`, `STOCK_URL` | ports Vite | URL des applications (liens dans les emails) |
| `NUM_PROXIES` | — (1 en Docker) | Nombre de proxies devant Django (IP réelle des clients) |
| `ADMIN_URL` | `admin/` | Chemin de l'administration plateforme |
| `SAAS_NOM` | `Duty Free Manager` | Nom affiché dans les emails |
| `JWT_ACCESS_MINUTES` | `120` | Durée de validité d'une session (renouvelée automatiquement 7 jours) |
| `THROTTLE_LOGIN` / `THROTTLE_INSCRIPTION` | `20/min` / `10/hour` | Limitation anti-force brute |
| `EMAIL_*`, `DEFAULT_FROM_EMAIL` | — | Envoi des bons de commande aux fournisseurs |

Frontends : `VITE_API_URL` (URL de l'API, avec `/api`) et `VITE_WS_URL` (vide = même hôte, recommandé derrière nginx).

---

## Rôles et accès

| Rôle | Backoffice | Caisse | Stock | Gestion utilisateurs, configuration, abonnement |
|---|---|---|---|---|
| Administrateur | ✅ | ✅ | ✅ | ✅ |
| Superviseur | ✅ | ✅ | ✅ | — |
| Stock manager | lecture | — | ✅ | — |
| Caissier | — | ✅ (PIN) | — | — |

- Les caissiers se connectent avec leur **PIN** (4 à 6 chiffres, stocké chiffré). Les autres rôles utilisent un mot de passe.
- Les **comptes plateforme** (créés par `createsuperuser`, sans organisation) servent uniquement à l'administration `/admin/` et n'ont pas accès aux données des boutiques via l'API.

---

## Exploitation de la plateforme

Depuis `/admin/` (compte opérateur). La liste *Organisations* porte un bouton **« Tableau de bord opérateur »** (nombre de boutiques, essais, abonnements actifs, revenu du mois, MRR, échéances).

| Tâche | Où |
|---|---|
| **Activer une boutique sans paiement en ligne** (espèces, virement, geste commercial, test sans carte) | *Organisations* → cocher → action **« Activer / offrir N mois »** (1, 3, 6 ou 12). Crée une facture offerte (0 XOF) pour la traçabilité et prolonge l'abonnement. |
| Encaisser un paiement reçu hors ligne | *Factures* → sélectionner → « Marquer comme payée et prolonger l'abonnement » |
| Suspendre / réactiver un client | *Organisations* → actions « Suspendre » / « Réactiver » |
| Changer le code entreprise ou le plan d'un client | *Organisations* → fiche |
| Modifier prix et limites des offres | *Plans* |
| Voir les utilisateurs d'une boutique | *Utilisateurs* → filtre par organisation |

Commandes utiles :

```bash
python manage.py taches_quotidiennes     # expirations + factures de renouvellement + relances (lancé chaque jour par le service scheduler)
python manage.py seed_database --slug demo2 --password MonMotDePasse   # autre boutique de démo
```

Sauvegarde PostgreSQL :
```bash
docker compose exec db pg_dump -U postgres dutyfree > sauvegarde_$(date +%F).sql
```

---

## API

Toutes les routes sont préfixées par `/api/`. Authentification : `Authorization: Bearer <access>`.

### Connexion
```bash
curl -X POST http://localhost:8000/api/auth/token/ \
  -H "Content-Type: application/json" \
  -d '{"organisation": "demo", "username": "admin", "password": "dutyfree2025"}'
# → {"access": "...", "refresh": "..."}
```
Les caissiers peuvent utiliser leur n° de caisse comme identifiant et leur PIN comme mot de passe.

### Routes principales

| Méthode | URL | Description |
|---|---|---|
| **SaaS** | | |
| GET | `/saas/plans/` | Offres (public) |
| POST | `/saas/inscription/` | Créer une boutique + son administrateur (public) |
| GET / PATCH | `/saas/organisation/` | Organisation courante, consommation des quotas |
| GET | `/saas/factures/` | Factures (admin) |
| POST | `/saas/factures/souscrire/` | `{plan, mois}` → nouvelle facture (admin) |
| POST | `/saas/factures/{id}/payer/` | URL de la page de paiement (admin) |
| POST | `/saas/factures/{id}/verifier/` | Revérifie le paiement auprès du prestataire (admin) |
| POST | `/saas/paiements/webhook/{prestataire}/` | Notification du prestataire (public, revérifiée) |
| **Authentification** | | |
| POST | `/auth/token/` | `{organisation, username, password}` |
| POST | `/auth/token/refresh/` | Renouveler le jeton (refresh à usage unique) |
| POST | `/auth/logout/` | `{refresh}` → révoque la session |
| POST | `/auth/mot-de-passe/oublie/` | `{organisation, email}` → email de réinitialisation |
| POST | `/auth/mot-de-passe/reinitialiser/` | `{uid, token, password}` |
| GET | `/utilisateurs/me/` | Profil + organisation |
| GET | `/utilisateurs/caissiers/?organisation=<code>` | Caissiers (écran de connexion caisse, public) |
| CRUD | `/utilisateurs/` | Utilisateurs (écriture : admin) |
| **Stock** | | |
| CRUD | `/stock/produits/` | Produits (`?search=`, `?ordering=`) |
| GET | `/stock/produits/par_barcode/?code=` | Recherche par code-barres |
| GET | `/stock/produits/alertes/`, `/stock/produits/stats/` | Ruptures et indicateurs |
| CRUD | `/stock/categories/`, `/stock/fournisseurs/`, `/stock/sommiers/` | Référentiels |
| GET / POST | `/stock/mouvements/` | Mouvements (pas de modification) |
| CRUD | `/stock/commandes/` | Commandes avec `lignes` |
| POST | `/stock/commandes/{id}/envoyer/` · `/recevoir/` | Envoi email + PDF · réception en stock |
| GET | `/stock/commandes/{id}/pdf/` | Bon de commande PDF |
| **Ventes** | | |
| GET / POST | `/ventes/` | Ventes (création depuis la caisse) |
| POST | `/ventes/sync_offline/` | Synchronisation des ventes hors ligne (idempotente) |
| GET | `/ventes/dashboard/`, `/ventes/taux_capture/` | Indicateurs |
| CRUD | `/ventes/passagers/` | Données passagers mensuelles |
| **Fidélité & configuration** | | |
| CRUD | `/fidelite/` | Cartes (`par_numero`, `ajouter_points`, `utiliser_points`, `statistiques`) |
| GET / PATCH | `/configuration/` | Paramètres de la boutique (écriture : admin) |
| GET | `/health/` | Sonde de disponibilité |

### Codes de réponse spécifiques
| Code | Signification |
|---|---|
| `402` | Abonnement expiré ou suspendu : écriture refusée |
| `403` avec `plan_limit_reached` | Limite du plan atteinte |
| `429` | Trop de tentatives (connexion / inscription) |

### WebSocket
`ws://<hôte>/ws/stock/?token=<access>` — événements `stock_snapshot`, `stock_update`, `new_sale`, `alert`, limités à l'organisation de l'utilisateur.

---

## Sécurité et performances

**Sécurité**
- Isolation stricte des données par organisation (filtrage des requêtes + validation des références), testée automatiquement.
- Mots de passe et PIN hachés (PBKDF2). Sessions JWT courtes (2 h) renouvelées automatiquement. Les refresh tokens sont **à usage unique** et **révoqués** à la déconnexion, au changement de mot de passe et à la désactivation d'un compte.
- Mot de passe oublié par email (lien signé valable 2 h, à usage unique, sans révéler si un compte existe).
- Limitation de débit sur la connexion, l'inscription et le paiement (nginx + Django, avec l'IP réelle du client).
- Suspension d'une organisation effective immédiatement, même avec un jeton encore valide.
- WebSockets authentifiés et cloisonnés. En-têtes de sécurité (`nosniff`, `X-Frame-Options`, HSTS en HTTPS…). Conteneur backend non-root. `SECRET_KEY` obligatoire en production.

**Performances**
- Utilisateur, organisation et plan chargés en **une seule requête SQL** par appel API.
- Compression gzip des réponses API et des applications ; assets versionnés en cache navigateur 1 an.
- Connexions persistantes vers PostgreSQL et entre nginx et le backend.
- Emails envoyés en arrière-plan (aucune latence ajoutée aux requêtes).
- Redis pour les WebSockets et le cache.

**Pourquoi pas des microservices ?** L'application est un *monolithe modulaire* : modules bien séparés (`tenants`, `stock`, `ventes`…), mais un seul déploiement et une seule base. C'est l'architecture de la plupart des SaaS à ce stade : moins de latence (pas d'appels réseau entre services), transactions fiables (une vente décrémente le stock et crédite la fidélité de façon atomique) et une exploitation simple. Pour monter en charge, on ajoute des instances du backend derrière nginx (l'état partagé est dans PostgreSQL et Redis). Un module pourra être extrait en service le jour où un besoin réel le justifiera.

## Mise en production

1. Serveur (VPS 2 vCPU / 4 Go suffit pour démarrer) avec Docker, un nom de domaine et un proxy TLS (Caddy ou Traefik avec Let's Encrypt) devant les ports 80/81/82.
2. Dans `.env`, changer toutes les lignes marquées `[PROD]` : `SECRET_KEY`, `POSTGRES_PASSWORD`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS`, `PUBLIC_URL`, `FRONTEND_URL`, `CAISSE_URL`, `STOCK_URL`, `USE_HTTPS=True`, `NUM_PROXIES=2`.
3. Paiement : `PAYMENT_PROVIDER=cinetpay` et clés du compte marchand. Email : un SMTP transactionnel (Brevo, Mailjet, SES…).
4. Lancer **sans** la surcharge locale : `docker compose -f docker-compose.yml up -d --build`.
5. `createsuperuser`, puis vérifier les prix des plans dans `/admin/`.
6. Si vous personnalisez `ADMIN_URL`, mettez le même chemin dans la `location /admin/` de `nginx-backend.conf`.
7. Sauvegardes automatiques quotidiennes de PostgreSQL (`pg_dump`) hors du serveur.

## Migration d'une installation existante

Pour une base créée avant le passage en SaaS (version mono-boutique) :

```bash
python manage.py migrate
```

- Toutes les données existantes sont rattachées à une organisation **`principal`** (plan Enterprise, actif 1 an).
- Les PIN caisse, auparavant en clair, sont chiffrés.
- Les utilisateurs se connectent avec le code entreprise **`principal`** et leurs identifiants habituels.
- Le code entreprise peut ensuite être modifié dans `/admin/` → *Organisations*.

> Faites une sauvegarde de la base avant de migrer.

---

## Tests

```bash
cd backend
python manage.py test
```
42 tests (`tenants/tests.py`, `tenants/tests_paiements.py`) : inscription, connexion par code entreprise et PIN, isolation entre organisations, unicité par organisation, quotas, rôles, cycle d'abonnement, paiement (simulateur et CinetPay simulé : montant falsifié, notification rejouée, fausse notification), renouvellement mensuel, déconnexion, refresh à usage unique, mot de passe oublié, suspension, nombre de requêtes SQL, ventes et synchronisation hors ligne.

Frontends : `npm run build` (vérification TypeScript + build) et `npm run lint` dans chaque application.

---

## Dépannage

| Symptôme | Cause probable / solution |
|---|---|
| « Code entreprise inconnu » | Vérifier le code dans `/admin/` → *Organisations* |
| Caisse : « Aucun caissier pour ce code entreprise » | Créer des utilisateurs de rôle *Caissier* dans le backoffice, ou corriger le code via « Changer de code entreprise » |
| Bandeau « lecture seule » | Essai ou abonnement échu : générer une facture (Abonnement) et la faire encaisser |
| « Limite du plan atteinte » | Passer à une offre supérieure ou désactiver des utilisateurs / produits |
| Le backend ne démarre pas : `SECRET_KEY doit être défini` | Renseigner `SECRET_KEY` dans `.env` (ou `DEBUG=True` en local) |
| Alertes temps réel absentes | Vérifier que Redis tourne et que `/ws/` passe par nginx ; en local, utiliser un seul processus |
| Erreur CORS dans le navigateur | Ajouter l'URL du frontend dans `CORS_ALLOWED_ORIGINS` |
| Email fournisseur non envoyé | Renseigner `EMAIL_HOST_USER` / `EMAIL_HOST_PASSWORD` et l'email du fournisseur |
| Pas d'email en local | Ouvrir Mailpit (http://localhost:8025) ; vérifier que `mailpit` tourne : `docker compose ps` |
| « Le service de paiement est momentanément indisponible » | Clés CinetPay absentes ou serveur sans Internet ; en local, `PAYMENT_PROVIDER=simulateur` |
| Paiement effectué mais facture « en attente » | La notification n'a pas pu atteindre le serveur (`PUBLIC_URL` non joignable) : bouton de revérification au retour, ou action manuelle dans `/admin/` |
| `429 Too Many Requests` en boutique | Beaucoup de connexions derrière la même IP : augmenter `THROTTLE_LOGIN` et `rate` dans `nginx.conf` |
| Build frontend : erreur de version Node | Node 20.19+ requis (les images Docker utilisent Node 22) |
