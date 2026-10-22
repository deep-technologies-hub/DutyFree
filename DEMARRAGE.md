# Démarrage — Duty Free Manager (test en local)

Guide pour lancer toute la plateforme sur une machine Windows avec Docker.
Documentation complète : [README.md](README.md).

---

## 1. Prérequis

- **Docker Desktop** installé et **démarré** (l'icône baleine doit être active).
- Une **connexion Internet** au premier lancement (téléchargement des images, pip, npm).

Vérifier que Docker répond :
```powershell
docker version
```

---

## 2. Lancer (le plus simple)

Dans **PowerShell**, à la racine du projet :
```powershell
cd "C:\Users\DEEP DEV\Desktop\DutyFree"
.\demarrer-local.ps1
```
Si un blocage `ExecutionPolicy` apparaît :
```powershell
powershell -ExecutionPolicy Bypass -File .\demarrer-local.ps1
```

Le script :
1. crée le fichier `.env` s'il manque (depuis `.env.example`) ;
2. construit et démarre tous les services ;
3. attend que le backend réponde ;
4. crée la **boutique de démonstration** et le **compte opérateur** ;
5. affiche les adresses et les identifiants.

> Premier lancement : quelques minutes (build). Les suivants sont quasi instantanés.

---

## 3. Lancer à la main (équivalent)

```powershell
cd "C:\Users\DEEP DEV\Desktop\DutyFree"

# .env : créer une fois à partir du modèle, puis ajuster si besoin
copy .env.example .env

docker compose up -d --build
docker compose exec backend python manage.py seed_database      # boutique de démo
docker compose exec -e DJANGO_SUPERUSER_PASSWORD=Plateforme-Local-2025 backend `
    python manage.py createsuperuser --noinput --username plateforme --email ops@localhost.test
```

---

## 4. Adresses et identifiants

> Ports par défaut : **80 / 81 / 82**. Sur cette machine ils sont réglés sur
> **8080 / 8081 / 8082** dans `.env` (les ports 80/81/82 étaient déjà pris).
> Adapte les URL ci-dessous à tes valeurs `HTTP_BACKOFFICE` / `HTTP_CAISSE` / `HTTP_STOCK`.

| Adresse | Application | Identifiants |
|---|---|---|
| http://localhost:8080 | Backoffice | code entreprise `demo` · `admin` · `dutyfree2025` |
| http://localhost:8080/inscription | Créer une nouvelle boutique | — |
| http://localhost:8081 | Caisse | code `demo` · Aminata Sawadogo · PIN `1234` |
| http://localhost:8082 | Stock | code `demo` · `stock` · `dutyfree2025` |
| http://localhost:8025 | Mailpit (tous les emails envoyés) | — |
| http://localhost:8080/admin/ | Console opérateur (plateforme) | `plateforme` · `Plateforme-Local-2025` |

---

## 5. Tester (parcours conseillé)

1. **Inscription** : `/inscription` → créer une boutique (plan Starter). Email de bienvenue dans Mailpit.
2. **Préparer** : Backoffice → *Produits* (ajouter des produits), *Utilisateurs* (créer un caissier avec n° de caisse + PIN).
3. **Vendre** : Caisse → code entreprise → caissier → PIN → encaisser. Stock et tableau de bord se mettent à jour en direct.
4. **Hors ligne** : F12 → Réseau → « Offline », vendre, repasser en ligne → la vente se synchronise.
5. **Quota** : créer une 2ᵉ caisse sur Starter → refus « Limite du plan atteinte ».
6. **Payer l'abonnement** : Backoffice → *Abonnement* → Business → *Générer la facture* → *Payer maintenant* → paiement simulé. Reçu dans Mailpit, plan activé.
7. **Activer sans payer** (pas de carte) : `/admin/` → *Organisations* → cocher → action **« Activer / offrir N mois »**.
8. **Renouvellement / expiration** : dans `/admin/`, régler l'échéance d'une boutique, puis :
   ```powershell
   docker compose exec backend python manage.py taches_quotidiennes
   ```

---

## 6. Commandes courantes

```powershell
docker compose ps                 # état des services
docker compose logs -f backend    # logs du backend (ou caisse, nginx, db...)
docker compose down               # arrêter (les données sont conservées)
docker compose up -d              # relancer
.\demarrer-local.ps1 -Reset       # tout effacer et repartir de zéro
```

---

## 7. En cas de problème

| Symptôme | Solution |
|---|---|
| `error during connect` / Docker injoignable | Ouvrir Docker Desktop et attendre qu'il soit prêt |
| `port is already allocated` | Un service occupe le port : changer `HTTP_BACKOFFICE` / `HTTP_CAISSE` / `HTTP_STOCK` dans `.env` |
| `database files are incompatible` | Ancien volume d'une autre version de Postgres : `docker compose down -v` puis relancer (efface les données locales) |
| `required variable POSTGRES_PASSWORD is missing` | Le fichier `.env` est absent : le recréer (`copy .env.example .env`) |
| Le backend ne répond pas | `docker compose logs backend` pour voir l'erreur |
| Pas d'email reçu | Ouvrir Mailpit : http://localhost:8025 |

---

## 8. Et pour la mise en ligne ?

Ne pas utiliser cette configuration locale en production. Voir la section
**« Mise en production »** du [README.md](README.md) : HTTPS, `SECRET_KEY` robuste,
`PAYMENT_PROVIDER=cinetpay` + clés marchand, SMTP réel, sauvegardes, et lancement
**sans** la surcharge locale :
```bash
docker compose -f docker-compose.yml up -d --build
```
