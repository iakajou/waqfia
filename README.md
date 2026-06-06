# Waqf IA 🇧🇪

> Outil gratuit pour identifier toutes les aides sociales auxquelles vous avez droit en Belgique.

## 🌐 Demo

**[waqfia.be](https://iakajou.github.io/waqfia)** ← accès direct

## ✨ Fonctionnalités

- 55+ aides analysées (fédéral, régional, communal)
- Moteur de règles local — aucun appel API, 100% gratuit
- Résultats personnalisés avec montants estimés
- Dossier PDF complet téléchargeable
- 100% confidentiel — aucune donnée stockée

## 📁 Structure

```
waqfia/
├── index.html          ← application complète (ouvrir dans navigateur)
├── scraper/
│   ├── scraper.js      ← mise à jour automatique des montants officiels
│   ├── integrer_montants.js
│   ├── package.json
│   └── README.md
└── README.md
```

## 🔄 Mise à jour des montants

Les montants des aides sont indexés chaque année. Pour les mettre à jour :

```bash
cd scraper/
npm install
node scraper.js          # scrape les sites officiels belges
node integrer_montants.js # génère le bloc à intégrer
```

## 🚀 Déploiement

Lappli est un fichier HTML unique — aucun serveur requis.

Hébergement GitHub Pages :
1. Settings → Pages → Source: main → /root
2. Accessible sur https://iakajou.github.io/waqfia

## 📋 Sources officielles

| Aide | Source |
|------|--------|
| RIS | mi-is.be |
| Handicap / APA | ph.belgium.be |
| GRAPA | sfpd.fgov.be |
| BIM / MAF | inami.fgov.be |
| Chômage | onem.be |
| AF Bruxelles | iriscare.brussels |
| AF Wallonie | famiwal.be |
| Loyer BXL | logement.brussels |
| Loyer Wallonie | logement.wallonie.be |
| Télécom | bipt.be |
| Énergie / Mazout | economie.fgov.be |

## ⚠️ Avertissement

Les montants affichés sont indicatifs. Léligibilité définitive est confirmée par les organismes compétents (CPAS, SPF, etc.).

---

Fait avec ❤️ pour faciliter laccès aux droits sociaux en Belgique.

