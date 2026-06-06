# Waqf IA — Scraper montants officiels belges

## Principe

Ce script va chercher automatiquement les montants officiels directement
sur les sites gouvernementaux belges et génère un fichier `montants_officiels.js`
que tu intègres dans ton projet.

## Installation (une seule fois)

```bash
cd scraper/
npm install
```

## Utilisation

```bash
# Scraper les montants officiels
node scraper.js

# Générer le bloc à copier dans moteur.js
node integrer_montants.js
```

## Résultat

- `montants_officiels.js`  → inclure dans ton HTML avant `aides.js`
- `montants_officiels.json` → archive brute des données scrapées
- `bloc_seuils.js`          → coller dans `moteur.js` (var S = {...})

## Sources officielles scrapées

| Aide | Site | URL |
|------|------|-----|
| RIS | mi-is.be | https://www.mi-is.be/fr/revenudintegration |
| Handicap / APA | ph.belgium.be | https://ph.belgium.be/fr/droits |
| GRAPA | sfpd.fgov.be | https://www.sfpd.fgov.be/fr/grapa |
| BIM | inami.fgov.be | https://www.inami.fgov.be |
| Chômage | onem.be | https://www.onem.be/fr/documentation/feuille-info/t2 |
| AF Bruxelles | iriscare.brussels | https://www.iriscare.brussels |
| AF Wallonie | famiwal.be | https://www.famiwal.be |
| Loyer BXL | logement.brussels | https://logement.brussels/fr/allocation-loyer |
| Loyer Wallonie | logement.wallonie.be | https://logement.wallonie.be |
| Télécom | bipt.be | https://www.bipt.be |
| Mazout | economie.fgov.be | https://economie.fgov.be |

## Quand relancer ?

- **1er janvier** → indexation annuelle (la plus importante)
- **1er juillet** → parfois révision intermédiaire des AF
- Après chaque annonce gouvernementale sur les allocations

## Cron job automatique (Linux/Mac)

```bash
# Dans crontab (crontab -e) : lance le scraper le 5 janvier, avril, juillet, octobre à 9h
0 9 5 1,4,7,10 * cd /chemin/vers/scraper && node scraper.js && node integrer_montants.js >> /var/log/waqfia-scraper.log 2>&1
```

## Si le scraping échoue sur un site

Les sites gouvernementaux belges changent parfois leur structure HTML.
Dans ce cas, les valeurs de référence Jan 2025 sont utilisées et signalées
dans le rapport. Tu veux alors vérifier manuellement sur l'URL indiquée.

## Fiabilité

- `scraped` = valeur récupérée depuis le site officiel ✅
- `partial`  = valeur partiellement récupérée ⚠️
- `reference_jan_2025` = valeur de référence (scraping échoué) ❌

