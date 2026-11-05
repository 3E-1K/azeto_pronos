# AZETO Pronos

Pronostics de football calculés à partir des vrais résultats (modèle de Poisson, forces attaque/défense pondérées par la date, Elo pour les coupes d'Europe).

- `index.html` : l'application (page statique).
- `data/donnees.js` : données, régénérées chaque jour par GitHub Actions (`.github/workflows/mise-a-jour.yml` → `scripts/update.mjs`).
- Sources : football-data.co.uk (résultats et cotes), openfootball (calendrier), clubelo.com (Elo).

Les probabilités sont des estimations statistiques, pas des certitudes. 18+. Jeu responsable.

---

© 2026 Yves Sourou Koudjo. Tous droits réservés.
Ce code, le modèle et le site AZETO Pronos sont la propriété de Yves Sourou Koudjo. Toute reproduction, copie, modification ou réutilisation, totale ou partielle, est interdite sans son autorisation écrite.
