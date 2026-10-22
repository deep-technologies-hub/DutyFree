# Duty Free Manager — Backend

API Django REST + WebSockets (Channels) de la plateforme SaaS Duty Free Manager.
Documentation complète (modèle SaaS, déploiement, API) : voir le [README principal](../README.md).

## Démarrage

```bash
python -m venv .venv
.venv\Scripts\activate            # Windows  (Linux/Mac : source .venv/bin/activate)
pip install -r requirements.txt
cp .env.example .env              # puis mettre DEBUG=True et vider POSTGRES_DB pour utiliser SQLite en local

python manage.py migrate
python manage.py seed_database    # boutique de démo, code entreprise « demo » (admin / dutyfree2025)
python manage.py createsuperuser  # compte opérateur plateforme → http://localhost:8000/admin/
python manage.py runserver
```

## Applications Django

| App | Contenu |
|---|---|
| `tenants` | Organisations, plans, factures, quotas, permissions, inscription, commandes `seed_database` et `expirer_abonnements` |
| `utilisateurs` | Utilisateur personnalisé (rôle, caisse, PIN chiffré), backend d'authentification par code entreprise |
| `stock` | Produits, catégories, fournisseurs, sommiers, mouvements, commandes fournisseurs, WebSocket |
| `ventes` | Ventes, lignes, paiements, tableau de bord, données passagers |
| `fidelite` | Cartes de fidélité et mouvements de points |
| `configuration` | Paramètres propres à chaque boutique |

## Ajouter un modèle métier

Pour qu'il soit automatiquement isolé par organisation :

1. Hériter de `tenants.models.TenantModel` (ajoute la FK `organisation`).
2. Serializer : hériter de `tenants.mixins.TenantModelSerializer` (organisation renseignée automatiquement, FK limitées à l'organisation).
3. ViewSet : ajouter `tenants.mixins.TenantScopedViewSetMixin` en premier parent.
4. Unicités : `UniqueConstraint(fields=['organisation', ...])` plutôt que `unique=True`.

## Tests

```bash
python manage.py test
```
