# Duty Free Manager — Caisse

Point de vente : connexion par PIN, scan code-barres, multi-devises (XOF/EUR/USD), paiements mixtes, fidélité, tickets (imprimante ESC/POS USB ou navigateur), clôture, **mode hors ligne** (les ventes sont gardées sur le poste et synchronisées au retour du réseau).

```bash
cp .env.example .env     # VITE_API_URL=http://localhost:8000/api
npm install
npm run dev
npm run build
```

Au premier lancement, saisir le **code entreprise** de la boutique (mémorisé sur le poste), puis choisir le caissier et taper son PIN. L'en-tête des tickets provient de *Backoffice → Configuration*. Voir le [README principal](../README.md).
