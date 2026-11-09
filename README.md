<img src="assets/icon.svg" width="64" height="64" alt="Externes Radio B">

# Externes Radio B — Hôpital Cochin

Application web ultra-simple dédiée aux **externes** du Service de Radiologie B (Hôpital Cochin — AP-HP), synchronisée en direct (lecture seule) avec le planning officiel des internes et seniors :

1. **Vacations du matin** (Lundi → Vendredi) : nom de l'**interne** et du **senior** sur chaque vacation ouverte du matin.
2. **Enseignement du mardi** : **Cours du mardi** (13h00 + senior intervenant) et **Interne qui présente le mardi** (cas clinique de 12h30).

## Mise à jour du bundle hors-ligne

```bash
python3 scripts/build_data.py
```
