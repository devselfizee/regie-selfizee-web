# regie-selfizee-web

Front de la plateforme de suivi Régie Selfizee / Ma Trombine (Next.js + Tailwind + TanStack Query + ECharts).
API : [regie-selfizee-api](https://github.com/devselfizee/regie-selfizee-api).

## Écrans

| Route | Contenu |
|---|---|
| `/` | Vue globale : KPI vs période précédente et N-1, courbe du CA, classement des lieux, parc, exports CSV |
| `/lieux` | Liste des lieux (CA et ventes sur 30 jours, bornes en place) |
| `/lieux/nouveau`, `/lieux/[id]/modifier` | Fiche lieu complète (identité, segment, activité, fréquentation, environnement, emplacement, commercial, contacts) |
| `/lieux/[id]` | Statistiques du lieu : heatmap jour × heure, jours de semaine, moyens de paiement, formules, meilleures dates, bornes |
| `/bornes` | Parc : connexion, création, affectation / déplacement / retrait, clés API |
| `/imports` | File d'erreurs d'ingestion |

Toutes les vues statistiques se filtrent par période, gamme, module et moyen de paiement, et par les champs de la fiche lieu.

## Démarrer en local

```bash
cp .env.example .env.local     # NEXT_PUBLIC_API_URL=http://localhost:3003/api
npm install
npm run dev                    # http://localhost:3000
```

L'API doit tourner (voir son README). Pour avoir des données : `npm run demo` côté API.

## À venir

- Authentification Keycloak (realm `konitys`) et droits par rôle (admin, commercial, technicien)
- Commissions et relevés (V1.1), alertes
