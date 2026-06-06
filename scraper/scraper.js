#!/usr/bin/env node
/**
 * WAQF IA — Scraper montants officiels belges
 * ============================================
 * Lance ce script sur ta propre machine (pas dans un sandbox).
 * 
 * Installation : npm install axios cheerio
 * Exécution    : node scraper.js
 * Résultat     : génère montants_officiels.js (à inclure dans le projet)
 * 
 * Sources :
 *   mi-is.be          → RIS (Revenu d'intégration sociale)
 *   ph.belgium.be     → Allocation intégration handicap + APA
 *   sfpd.fgov.be      → GRAPA
 *   inami.fgov.be     → BIM / MAF / Incapacité
 *   onem.be           → Allocations chômage
 *   iriscare.brussels → Allocations familiales Bruxelles
 *   famiwal.be        → Allocations familiales Wallonie
 *   logement.brussels → Allocation loyer RBC
 *   logement.wallonie → Allocation loyer Wallonie
 *   bipt.be           → Tarif social télécom
 *   economie.fgov.be  → Tarif social énergie / Fonds mazout
 */

'use strict';
const axios   = require('axios');
const cheerio = require('cheerio');
const fs      = require('fs');
const path    = require('path');

// ─── Configuration ──────────────────────────────────────────────────────────
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'fr-BE,fr;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Referer': 'https://www.google.be/'
};
const TIMEOUT = 15000;
const DELAY_MS = 1200; // délai entre requêtes pour ne pas être bloqué

// ─── Résultats globaux ───────────────────────────────────────────────────────
const resultats = {
  date_scraping: new Date().toISOString(),
  sources_ok: [],
  sources_echec: [],
  montants: {}
};

// ─── Utilitaires ────────────────────────────────────────────────────────────
function log(emoji, msg) { console.log(`${emoji}  ${msg}`); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function extraireNombre(texte) {
  if (!texte) return null;
  // Formats : "1.301,05" ou "1 301,05" ou "1301.05" ou "1.301"
  const m = texte.replace(/\s/g, '')
    .match(/(\d{1,4}[.,]\d{3}[.,]\d{2}|\d{1,4}[.,]\d{3}|\d{1,4}[.,]\d{2}|\d{3,4})/);
  if (!m) return null;
  const num = m[0].replace(/\./g, '').replace(',', '.');
  const val = parseFloat(num);
  return (val > 50 && val < 10000) ? Math.round(val * 100) / 100 : null;
}

async function fetchPage(url) {
  const resp = await axios.get(url, { headers: HEADERS, timeout: TIMEOUT });
  return cheerio.load(resp.data);
}

// ─── SCRAPER 1 : RIS — mi-is.be ─────────────────────────────────────────────
async function scraperRIS() {
  const URL = 'https://www.mi-is.be/fr/revenudintegration';
  log('🔍', `RIS → ${URL}`);
  try {
    const $ = await fetchPage(URL);
    const texte = $('body').text();
    
    // Patterns attendus sur mi-is.be : "1 301,05" ou "1.301,05"
    // Catégorie 1 (isolé) et catégorie 3 (chef de ménage) = même montant
    // Catégorie 2 (cohabitant) = montant inférieur
    const montants = [];
    $('td, p, li, .field-item').each((i, el) => {
      const t = $(el).text().trim();
      if (t.match(/1[.\s]?[23]0[01][,.]?\d*/)) {
        const n = extraireNombre(t);
        if (n && n > 800 && n < 1500) montants.push(n);
      }
    });
    
    // Alternative : regex directe sur le texte complet
    const matches = texte.match(/1[\s.]?[23]\d\d[,\.]\d{2}/g) || [];
    matches.forEach(m => {
      const n = extraireNombre(m);
      if (n && n > 800 && n < 1500 && !montants.includes(n)) montants.push(n);
    });

    const cohabitMatches = texte.match(/8[5-9]\d[,\.]\d{2}|[89]\d\d[,\.]\d{2}/g) || [];
    const cohabitants = [];
    cohabitMatches.forEach(m => {
      const n = extraireNombre(m);
      if (n && n > 600 && n < 1000) cohabitants.push(n);
    });

    if (montants.length > 0) {
      const isole = Math.max(...montants);
      const cohabitant = cohabitants.length > 0 ? Math.min(...cohabitants) : null;
      resultats.montants.ris = {
        isole_chef_menage: isole,
        cohabitant: cohabitant || Math.round(isole * 0.667 * 100) / 100,
        source: URL,
        fiabilite: 'scraped'
      };
      resultats.sources_ok.push('RIS (mi-is.be)');
      log('✅', `RIS isolé: ${isole}€ | cohabitant: ${resultats.montants.ris.cohabitant}€`);
    } else {
      throw new Error('Montants non trouvés dans la page');
    }
  } catch (e) {
    log('❌', `RIS échec: ${e.message} → utilisation valeurs de référence`);
    resultats.sources_echec.push({ source: 'RIS (mi-is.be)', erreur: e.message });
    // Valeurs de référence basées sur l'indexation belge historique
    // RIS augmente en moyenne de 2-4% par an (index santé lissé)
    // Base connue : 01/2025 → isolé 1 301,05€ ; cohabitant 867,37€
    // Estimation 01/2026 avec index ~2,5% : isolé ≈ 1 334€, cohabitant ≈ 889€
    resultats.montants.ris = {
      isole_chef_menage: 1301.05,
      cohabitant: 867.37,
      source: URL,
      fiabilite: 'reference_jan_2025',
      note: 'Scraping échoué — vérifier manuellement sur mi-is.be'
    };
  }
}

// ─── SCRAPER 2 : Allocation Intégration Handicap + APA — ph.belgium.be ───────
async function scraperHandicap() {
  const URL = 'https://ph.belgium.be/fr/droits/travailleurs-et-demandeurs-demploi/allocation-dintegration';
  log('🔍', `Handicap → ${URL}`);
  try {
    const $ = await fetchPage(URL);
    const texte = $('body').text();
    
    // Chercher les 5 catégories : cat1~110€, cat2~280€, cat3~510€, cat4~730€, cat5~940€
    const cats = {};
    const patterns = [
      { key: 'cat1', range: [90, 150] },
      { key: 'cat2', range: [250, 320] },
      { key: 'cat3', range: [480, 560] },
      { key: 'cat4', range: [700, 760] },
      { key: 'cat5', range: [900, 980] }
    ];
    
    const allNums = [];
    texte.match(/\d{2,3}[,\.]\d{2}/g)?.forEach(m => {
      const n = extraireNombre(m);
      if (n && n > 90 && n < 1000) allNums.push(n);
    });
    
    patterns.forEach(p => {
      const found = allNums.filter(n => n >= p.range[0] && n <= p.range[1]);
      if (found.length > 0) cats[p.key] = Math.max(...found);
    });
    
    if (Object.keys(cats).length >= 3) {
      resultats.montants.allocation_handicap = { ...cats, source: URL, fiabilite: 'scraped' };
      resultats.sources_ok.push('Allocation handicap (ph.belgium.be)');
      log('✅', `Handicap: ${JSON.stringify(cats)}`);
    } else {
      throw new Error(`Seulement ${Object.keys(cats).length} catégories trouvées`);
    }
  } catch (e) {
    log('❌', `Handicap échec: ${e.message}`);
    resultats.sources_echec.push({ source: 'Handicap (ph.belgium.be)', erreur: e.message });
    resultats.montants.allocation_handicap = {
      cat1: 110.02, cat2: 282.38, cat3: 508.96, cat4: 729.38, cat5: 942.39,
      source: URL, fiabilite: 'reference_jan_2025',
      note: 'Scraping échoué — vérifier sur ph.belgium.be'
    };
  }
}

// ─── SCRAPER 3 : GRAPA — sfpd.fgov.be ───────────────────────────────────────
async function scraperGRAPA() {
  const URL = 'https://www.sfpd.fgov.be/fr/grapa';
  log('🔍', `GRAPA → ${URL}`);
  try {
    const $ = await fetchPage(URL);
    const texte = $('body').text();
    
    // GRAPA isolé ~1135€, cohabitant ~756€
    const allNums = [];
    texte.match(/\d{3,4}[,\.]\d{2}/g)?.forEach(m => {
      const n = extraireNombre(m);
      if (n && n > 700 && n < 1200) allNums.push(n);
    });
    
    const isoles = allNums.filter(n => n > 1050 && n < 1200);
    const cohabitants = allNums.filter(n => n > 700 && n < 850);
    
    if (isoles.length > 0) {
      resultats.montants.grapa = {
        isole: Math.max(...isoles),
        cohabitant: cohabitants.length > 0 ? Math.max(...cohabitants) : null,
        source: URL, fiabilite: 'scraped'
      };
      resultats.sources_ok.push('GRAPA (sfpd.fgov.be)');
      log('✅', `GRAPA isolé: ${resultats.montants.grapa.isole}€ | cohabitant: ${resultats.montants.grapa.cohabitant}€`);
    } else {
      throw new Error('Montants GRAPA non trouvés');
    }
  } catch (e) {
    log('❌', `GRAPA échec: ${e.message}`);
    resultats.sources_echec.push({ source: 'GRAPA (sfpd.fgov.be)', erreur: e.message });
    resultats.montants.grapa = {
      isole: 1135.89, cohabitant: 756.59,
      source: URL, fiabilite: 'reference_jan_2025',
      note: 'Scraping échoué — vérifier sur sfpd.fgov.be'
    };
  }
}

// ─── SCRAPER 4 : BIM — inami.fgov.be ────────────────────────────────────────
async function scraperBIM() {
  const URL = 'https://www.inami.fgov.be/fr/themes/cout-remboursement/faciliter-acces/Pages/intervention-majoree.aspx';
  log('🔍', `BIM → ${URL}`);
  try {
    const $ = await fetchPage(URL);
    const texte = $('body').text();
    
    // Chercher seuil BIM isolé ~21 000€/an et supplement par enfant ~3 900€
    const annuels = [];
    texte.match(/\d{2}[\s.]\d{3}[,\.]\d{2}|\d{5,6}[,\.]\d{2}/g)?.forEach(m => {
      const n = extraireNombre(m.replace(/\s/g,''));
      if (n && n > 15000 && n < 30000) annuels.push(n);
    });
    
    const supplements = [];
    texte.match(/[34]\s?[\s.]\d{3}[,\.]\d{2}/g)?.forEach(m => {
      const n = extraireNombre(m.replace(/\s/g,''));
      if (n && n > 3000 && n < 5000) supplements.push(n);
    });
    
    if (annuels.length > 0) {
      resultats.montants.bim = {
        seuil_isole_annuel: Math.min(...annuels), // prendre le plus petit = isolé
        supplement_par_enfant: supplements.length > 0 ? Math.min(...supplements) : 3912.28,
        source: URL, fiabilite: 'scraped'
      };
      resultats.sources_ok.push('BIM (inami.fgov.be)');
      log('✅', `BIM seuil isolé: ${resultats.montants.bim.seuil_isole_annuel}€/an`);
    } else {
      throw new Error('Seuils BIM non trouvés');
    }
  } catch (e) {
    log('❌', `BIM échec: ${e.message}`);
    resultats.sources_echec.push({ source: 'BIM (inami.fgov.be)', erreur: e.message });
    resultats.montants.bim = {
      seuil_isole_annuel: 21139.43, supplement_par_enfant: 3912.28,
      source: URL, fiabilite: 'reference_jan_2025',
      note: 'Scraping échoué — vérifier sur inami.fgov.be'
    };
  }
}

// ─── SCRAPER 5 : Allocations chômage — onem.be ──────────────────────────────
async function scraperChomage() {
  const URL = 'https://www.onem.be/fr/documentation/feuille-info/t2';
  log('🔍', `Chômage → ${URL}`);
  try {
    const $ = await fetchPage(URL);
    const texte = $('body').text();
    
    // Plafond chômage isolé ~2024€, cohabitant ~1867€
    // Taux : isolé 65%, cohabitant 60%
    const plafonds = [];
    texte.match(/[12]\s?[\s.]\d{3}[,\.]\d{2}/g)?.forEach(m => {
      const n = extraireNombre(m.replace(/\s/g,''));
      if (n && n > 1800 && n < 2200) plafonds.push(n);
    });
    
    if (plafonds.length >= 1) {
      const max_plafond = Math.max(...plafonds);
      resultats.montants.chomage = {
        plafond_isole_chef_menage: max_plafond,
        plafond_cohabitant: plafonds.filter(n => n < max_plafond * 0.95)[0] || Math.round(max_plafond * 0.922 * 100) / 100,
        taux_isole_chef_menage_pct: 65,
        taux_cohabitant_pct: 60,
        source: URL, fiabilite: 'scraped'
      };
      resultats.sources_ok.push('Chômage (onem.be)');
      log('✅', `Chômage plafond isolé: ${max_plafond}€`);
    } else {
      throw new Error('Plafonds chômage non trouvés');
    }
  } catch (e) {
    log('❌', `Chômage échec: ${e.message}`);
    resultats.sources_echec.push({ source: 'Chômage (onem.be)', erreur: e.message });
    resultats.montants.chomage = {
      plafond_isole_chef_menage: 2024.90,
      plafond_cohabitant: 1867.03,
      taux_isole_chef_menage_pct: 65,
      taux_cohabitant_pct: 60,
      source: URL, fiabilite: 'reference_jan_2025',
      note: 'Scraping échoué — vérifier sur onem.be/feuille-info/t2'
    };
  }
}

// ─── SCRAPER 6 : Allocations familiales Bruxelles — iriscare.brussels ────────
async function scraperAFBruxelles() {
  const URL = 'https://www.iriscare.brussels/citoyen/naissance-et-enfance/allocations-familiales/';
  log('🔍', `AF Bruxelles → ${URL}`);
  try {
    const $ = await fetchPage(URL);
    const texte = $('body').text();
    
    // 1er enfant ~171€, 2e ~318€, 3e ~528€
    const petits = texte.match(/1[6-9]\d[,\.]\d{2}|17\d[,\.]\d{2}/g) || [];
    const moyens  = texte.match(/3[01]\d[,\.]\d{2}|32\d[,\.]\d{2}/g) || [];
    const grands  = texte.match(/5[12]\d[,\.]\d{2}|53\d[,\.]\d{2}/g) || [];
    const supps   = texte.match(/5[0-9][,\.]\d{2}|4[5-9][,\.]\d{2}/g) || [];
    
    const e1 = petits.map(extraireNombre).filter(n=>n&&n>160&&n<200)[0];
    const e2 = moyens.map(extraireNombre).filter(n=>n&&n>300&&n<350)[0];
    const e3 = grands.map(extraireNombre).filter(n=>n&&n>500&&n<560)[0];
    const sup = supps.map(extraireNombre).filter(n=>n&&n>45&&n<65)[0];
    
    if (e1) {
      resultats.montants.af_bruxelles = {
        enfant_1: e1,
        enfant_2: e2 || null,
        enfant_3plus: e3 || null,
        supplement_social: sup || null,
        source: URL, fiabilite: e2 ? 'scraped' : 'partial'
      };
      resultats.sources_ok.push('AF Bruxelles (iriscare.brussels)');
      log('✅', `AF BXL: 1er=${e1}€ 2e=${e2}€ 3e+=${e3}€ supp=${sup}€`);
    } else {
      throw new Error('Montants AF non trouvés');
    }
  } catch (e) {
    log('❌', `AF Bruxelles échec: ${e.message}`);
    resultats.sources_echec.push({ source: 'AF Bruxelles (iriscare.brussels)', erreur: e.message });
    resultats.montants.af_bruxelles = {
      enfant_1: 171.14, enfant_2: 318.60, enfant_3plus: 528.47,
      supplement_social: 53.83, supplement_monoparental: 47.09,
      source: URL, fiabilite: 'reference_jan_2025',
      note: 'Scraping échoué — vérifier sur iriscare.brussels'
    };
  }
}

// ─── SCRAPER 7 : Allocations familiales Wallonie — famiwal.be ────────────────
async function scraperAFWallonie() {
  const URL = 'https://www.famiwal.be';
  const URL2 = 'https://www.famiwal.be/allocations-familiales/montants';
  log('🔍', `AF Wallonie → ${URL}`);
  try {
    let $ = await fetchPage(URL2).catch(() => fetchPage(URL));
    const texte = $('body').text();
    
    // 1er enfant ~177€, 2e ~328€, 3e ~492€, supplément ~137€
    const e1s = texte.match(/17[5-9][,\.]\d{2}|17\d[,\.]\d{2}/g) || [];
    const e2s = texte.match(/32[5-9][,\.]\d{2}|33\d[,\.]\d{2}/g) || [];
    const e3s = texte.match(/4[89]\d[,\.]\d{2}|49\d[,\.]\d{2}/g) || [];
    const sups = texte.match(/1[23]\d[,\.]\d{2}/g) || [];
    
    const e1 = e1s.map(extraireNombre).filter(n=>n&&n>170&&n<190)[0];
    const e2 = e2s.map(extraireNombre).filter(n=>n&&n>320&&n<345)[0];
    const e3 = e3s.map(extraireNombre).filter(n=>n&&n>480&&n<510)[0];
    const sup = sups.map(extraireNombre).filter(n=>n&&n>125&&n<150)[0];
    
    if (e1) {
      resultats.montants.af_wallonie = {
        enfant_1: e1, enfant_2: e2||null, enfant_3plus: e3||null,
        supplement_social: sup||null,
        source: URL, fiabilite: e2?'scraped':'partial'
      };
      resultats.sources_ok.push('AF Wallonie (famiwal.be)');
      log('✅', `AF Wallonie: 1er=${e1}€ 2e=${e2}€ 3e+=${e3}€`);
    } else {
      throw new Error('Montants AF Wallonie non trouvés');
    }
  } catch (e) {
    log('❌', `AF Wallonie échec: ${e.message}`);
    resultats.sources_echec.push({ source: 'AF Wallonie (famiwal.be)', erreur: e.message });
    resultats.montants.af_wallonie = {
      enfant_1: 177.37, enfant_2: 328.21, enfant_3plus: 492.31,
      supplement_social: 137.06,
      source: URL, fiabilite: 'reference_jan_2025',
      note: 'Scraping échoué — vérifier sur famiwal.be'
    };
  }
}

// ─── SCRAPER 8 : Allocation loyer Bruxelles — logement.brussels ──────────────
async function scraperLoyerBruxelles() {
  const URL = 'https://logement.brussels/fr/allocation-loyer';
  log('🔍', `Loyer BXL → ${URL}`);
  try {
    const $ = await fetchPage(URL);
    const texte = $('body').text();
    
    // Max loyer 240€, plafond revenus isolé ~1580€
    const maxMontant = texte.match(/24\d[,\.]\d{2}/g)?.map(extraireNombre).filter(n=>n&&n>230&&n<250)[0];
    const plafondRev = texte.match(/1[\s.]?[56]\d\d[,\.]\d{2}/g)?.map(m=>extraireNombre(m.replace(/\s/g,''))).filter(n=>n&&n>1500&&n<1700)[0];
    
    if (maxMontant) {
      resultats.montants.loyer_bruxelles = {
        montant_max: maxMontant,
        plafond_revenus_isole: plafondRev || 1580.09,
        source: URL, fiabilite: plafondRev ? 'scraped' : 'partial'
      };
      resultats.sources_ok.push('Loyer Bruxelles (logement.brussels)');
      log('✅', `Loyer BXL max: ${maxMontant}€ | plafond rev: ${plafondRev}€`);
    } else {
      throw new Error('Montants allocation loyer BXL non trouvés');
    }
  } catch (e) {
    log('❌', `Loyer BXL échec: ${e.message}`);
    resultats.sources_echec.push({ source: 'Loyer BXL (logement.brussels)', erreur: e.message });
    resultats.montants.loyer_bruxelles = {
      montant_max: 240, plafond_revenus_isole: 1580.09,
      source: URL, fiabilite: 'reference_jan_2025',
      note: 'Scraping échoué — vérifier sur logement.brussels'
    };
  }
}

// ─── SCRAPER 9 : Allocation loyer Wallonie ───────────────────────────────────
async function scraperLoyerWallonie() {
  const URL = 'https://logement.wallonie.be/fr/locataires/allocation-loyer';
  log('🔍', `Loyer Wallonie → ${URL}`);
  try {
    const $ = await fetchPage(URL);
    const texte = $('body').text();
    
    const maxMontant = texte.match(/19[0-9][,\.]\d{2}/g)?.map(extraireNombre).filter(n=>n&&n>185&&n<200)[0];
    const plafondRev = texte.match(/1[\s.]?[56]\d\d[,\.]\d{2}/g)?.map(m=>extraireNombre(m.replace(/\s/g,''))).filter(n=>n&&n>1500&&n<1700)[0];
    
    if (maxMontant) {
      resultats.montants.loyer_wallonie = {
        montant_max: maxMontant,
        plafond_revenus_isole: plafondRev || 1580.09,
        source: URL, fiabilite: 'scraped'
      };
      resultats.sources_ok.push('Loyer Wallonie (logement.wallonie.be)');
      log('✅', `Loyer Wallonie max: ${maxMontant}€`);
    } else {
      throw new Error('Montants allocation loyer Wallonie non trouvés');
    }
  } catch (e) {
    log('❌', `Loyer Wallonie échec: ${e.message}`);
    resultats.sources_echec.push({ source: 'Loyer Wallonie (logement.wallonie.be)', erreur: e.message });
    resultats.montants.loyer_wallonie = {
      montant_max: 192, plafond_revenus_isole: 1580.09,
      source: URL, fiabilite: 'reference_jan_2025',
      note: 'Scraping échoué — vérifier sur logement.wallonie.be'
    };
  }
}

// ─── SCRAPER 10 : Tarif social télécom — bipt.be ────────────────────────────
async function scraperTelecom() {
  const URL = 'https://www.bipt.be/fr/operateurs/telecommunications/service-universel/tarif-social';
  log('🔍', `Télécom → ${URL}`);
  try {
    const $ = await fetchPage(URL);
    const texte = $('body').text();
    
    // Téléphone fixe ≤ 10,25€, internet ≤ 19,85€
    const tel  = texte.match(/1[0-1][,\.]\d{2}/g)?.map(extraireNombre).filter(n=>n&&n>9&&n<12)[0];
    const inet = texte.match(/19[,\.]\d{2}|18[,\.]\d{2}/g)?.map(extraireNombre).filter(n=>n&&n>17&&n<21)[0];
    
    if (tel || inet) {
      resultats.montants.telecom = {
        telephone_fixe_max: tel || 10.25,
        internet_fixe_max: inet || 19.85,
        source: URL, fiabilite: 'scraped'
      };
      resultats.sources_ok.push('Télécom (bipt.be)');
      log('✅', `Télécom: fixe=${tel}€ internet=${inet}€`);
    } else {
      throw new Error('Tarifs télécom non trouvés');
    }
  } catch (e) {
    log('❌', `Télécom échec: ${e.message}`);
    resultats.sources_echec.push({ source: 'Télécom (bipt.be)', erreur: e.message });
    resultats.montants.telecom = {
      telephone_fixe_max: 10.25, internet_fixe_max: 19.85,
      source: URL, fiabilite: 'reference_jan_2025',
      note: 'Scraping échoué — vérifier sur bipt.be'
    };
  }
}

// ─── SCRAPER 11 : Primes naissance ──────────────────────────────────────────
async function scraperNaissance() {
  // Bruxelles
  const URL_BXL  = 'https://www.iriscare.brussels/citoyen/naissance-et-enfance/prime-de-naissance/';
  // Wallonie
  const URL_WALL = 'https://www.famiwal.be/prime-de-naissance';
  
  log('🔍', `Primes naissance → iriscare + famiwal`);
  
  // Bruxelles
  try {
    const $ = await fetchPage(URL_BXL);
    const texte = $('body').text();
    const p1 = texte.match(/1[\s.]?\d{3}[,\.]\d{2}/g)?.map(m=>extraireNombre(m.replace(/\s/g,''))).filter(n=>n&&n>1050&&n<1200)[0];
    const p2 = texte.match(/[89]\d{2}[,\.]\d{2}/g)?.map(extraireNombre).filter(n=>n&&n>800&&n<950)[0];
    if (p1) {
      resultats.montants.prime_naissance_bxl = { premier: p1, suivants: p2||null, source: URL_BXL, fiabilite: 'scraped' };
      resultats.sources_ok.push('Prime naissance BXL (iriscare)');
      log('✅', `Prime naissance BXL: 1er=${p1}€ 2e+=${p2}€`);
    } else throw new Error('Montant non trouvé');
  } catch (e) {
    log('❌', `Prime naissance BXL: ${e.message}`);
    resultats.sources_echec.push({ source: 'Prime naissance BXL', erreur: e.message });
    resultats.montants.prime_naissance_bxl = {
      premier: 1101.82, suivants: 826.36, source: URL_BXL, fiabilite: 'reference_jan_2025',
      note: 'Scraping échoué — vérifier sur iriscare.brussels'
    };
  }
  
  await sleep(DELAY_MS);
  
  // Wallonie
  try {
    const $ = await fetchPage(URL_WALL);
    const texte = $('body').text();
    const p1 = texte.match(/1[\s.]?\d{3}[,\.]\d{2}/g)?.map(m=>extraireNombre(m.replace(/\s/g,''))).filter(n=>n&&n>1200&&n<1350)[0];
    const p2 = texte.match(/[89]\d{2}[,\.]\d{2}/g)?.map(extraireNombre).filter(n=>n&&n>900&&n<1000)[0];
    if (p1) {
      resultats.montants.prime_naissance_wall = { premier: p1, suivants: p2||null, source: URL_WALL, fiabilite: 'scraped' };
      resultats.sources_ok.push('Prime naissance Wallonie (famiwal)');
      log('✅', `Prime naissance Wallonie: 1er=${p1}€ 2e+=${p2}€`);
    } else throw new Error('Montant non trouvé');
  } catch (e) {
    log('❌', `Prime naissance Wallonie: ${e.message}`);
    resultats.sources_echec.push({ source: 'Prime naissance Wallonie', erreur: e.message });
    resultats.montants.prime_naissance_wall = {
      premier: 1254.89, suivants: 941.16, source: URL_WALL, fiabilite: 'reference_jan_2025',
      note: 'Scraping échoué — vérifier sur famiwal.be'
    };
  }
}

// ─── SCRAPER 12 : Fonds mazout — economie.fgov.be ───────────────────────────
async function scraperMazout() {
  const URL = 'https://economie.fgov.be/fr/themes/energie/fonds-social-chauffage';
  log('🔍', `Mazout → ${URL}`);
  try {
    const $ = await fetchPage(URL);
    const texte = $('body').text();
    
    // Réduction par litre ~0,1665€, plafond 1500L
    const reduction = texte.match(/0[,\.]\d{4}/g)?.map(extraireNombre).filter(n=>n&&n>0.1&&n<0.3)[0];
    const plafondL  = texte.match(/1[\s.]?500/g)?.[0] ? 1500 : null;
    
    if (reduction) {
      resultats.montants.fonds_mazout = {
        reduction_par_litre: reduction,
        plafond_litres: plafondL || 1500,
        source: URL, fiabilite: 'scraped'
      };
      resultats.sources_ok.push('Fonds mazout (economie.fgov.be)');
      log('✅', `Mazout: réduction=${reduction}€/L`);
    } else throw new Error('Réduction mazout non trouvée');
  } catch (e) {
    log('❌', `Mazout échec: ${e.message}`);
    resultats.sources_echec.push({ source: 'Fonds mazout (economie.fgov.be)', erreur: e.message });
    resultats.montants.fonds_mazout = {
      reduction_par_litre: 0.1665, plafond_litres: 1500,
      source: URL, fiabilite: 'reference_jan_2025',
      note: 'Scraping échoué — vérifier sur economie.fgov.be'
    };
  }
}

// ─── SCRAPER 13 : APA personnes âgées — ph.belgium.be ───────────────────────
async function scraperAPA() {
  const URL = 'https://ph.belgium.be/fr/droits/personnes-agees/allocation-pour-laide-aux-personnes-agees';
  log('🔍', `APA → ${URL}`);
  try {
    const $ = await fetchPage(URL);
    const texte = $('body').text();
    
    // Cat5 max ~942€, cat4~729€, cat3~564€, cat2~368€, cat1~93€
    const cats = {};
    const allN = (texte.match(/\d{2,3}[,\.]\d{2}/g)||[]).map(extraireNombre).filter(n=>n&&n>80&&n<1000);
    const ranges = [
      {k:'cat1',r:[80,130]},{k:'cat2',r:[340,410]},{k:'cat3',r:[540,600]},
      {k:'cat4',r:[700,760]},{k:'cat5',r:[900,980]}
    ];
    ranges.forEach(({k,r}) => {
      const found = allN.filter(n=>n>=r[0]&&n<=r[1]);
      if(found.length) cats[k] = Math.max(...found);
    });
    
    if (Object.keys(cats).length >= 3) {
      resultats.montants.apa = {...cats, source: URL, fiabilite: 'scraped'};
      resultats.sources_ok.push('APA (ph.belgium.be)');
      log('✅', `APA: ${JSON.stringify(cats)}`);
    } else throw new Error('Catégories APA insuffisantes');
  } catch (e) {
    log('❌', `APA échec: ${e.message}`);
    resultats.sources_echec.push({ source: 'APA (ph.belgium.be)', erreur: e.message });
    resultats.montants.apa = {
      cat1: 93.66, cat2: 368.18, cat3: 564.65, cat4: 729.38, cat5: 942.39,
      source: URL, fiabilite: 'reference_jan_2025',
      note: 'Scraping échoué — vérifier sur ph.belgium.be'
    };
  }
}

// ─── GÉNÉRATION DU FICHIER montants_officiels.js ────────────────────────────
function genererFichier() {
  const nbOk     = resultats.sources_ok.length;
  const nbEchec  = resultats.sources_echec.length;
  const fiabilite = Math.round((nbOk / (nbOk + nbEchec)) * 100);
  
  const content = `/**
 * MONTANTS OFFICIELS AIDES SOCIALES BELGES
 * =========================================
 * Généré automatiquement le : ${new Date().toLocaleString('fr-BE')}
 * Sources récupérées avec succès : ${nbOk} / ${nbOk + nbEchec}
 * Fiabilité globale : ${fiabilite}%
 * 
 * Sources en ÉCHEC (montants de référence utilisés) :
${resultats.sources_echec.map(s => ` *   - ${s.source}: ${s.erreur}`).join('\n')||' *   (aucune)'}
 * 
 * ⚠️  Vérifiez toujours les montants marqués 'reference_jan_2025'
 *     directement sur les sites officiels avant publication.
 *
 * Pour mettre à jour : node scraper.js
 */

window.MONTANTS_OFFICIELS = ${JSON.stringify(resultats.montants, null, 2)};

window.SCRAPING_META = {
  date: "${new Date().toISOString()}",
  sources_ok: ${nbOk},
  sources_echec: ${nbEchec},
  fiabilite_pct: ${fiabilite},
  echecs: ${JSON.stringify(resultats.sources_echec.map(s=>s.source))}
};
`;
  
  fs.writeFileSync(path.join(__dirname, 'montants_officiels.js'), content, 'utf8');
  fs.writeFileSync(path.join(__dirname, 'montants_officiels.json'), JSON.stringify(resultats, null, 2), 'utf8');
  
  log('📄', `Fichier généré : montants_officiels.js`);
  log('📄', `Fichier JSON   : montants_officiels.json`);
}

// ─── RAPPORT FINAL ───────────────────────────────────────────────────────────
function afficherRapport() {
  console.log('\n' + '═'.repeat(60));
  console.log('  RAPPORT DE SCRAPING — WAQF IA');
  console.log('═'.repeat(60));
  console.log(`\n✅ Sources OK     : ${resultats.sources_ok.length}`);
  resultats.sources_ok.forEach(s => console.log(`     → ${s}`));
  if (resultats.sources_echec.length > 0) {
    console.log(`\n❌ Sources échec  : ${resultats.sources_echec.length}`);
    resultats.sources_echec.forEach(s => console.log(`     → ${s.source}: ${s.erreur}`));
    console.log('\n⚠️  Pour les sources en échec : montants de référence Jan 2025 utilisés.');
    console.log('   Vérifiez manuellement ces montants avant de mettre à jour votre app.');
  }
  console.log('\n📋 Montants récupérés :');
  Object.entries(resultats.montants).forEach(([k, v]) => {
    const flag = v.fiabilite === 'scraped' ? '✅' : v.fiabilite === 'partial' ? '⚠️ ' : '❌';
    const montant = Object.entries(v)
      .filter(([key]) => !['source','fiabilite','note'].includes(key))
      .map(([key, val]) => typeof val === 'number' ? `${key}: ${val}€` : '')
      .filter(Boolean).slice(0,2).join(' | ');
    console.log(`   ${flag} ${k.padEnd(25)} ${montant}`);
  });
  console.log('\n' + '═'.repeat(60) + '\n');
}

// ─── ORCHESTRATION ───────────────────────────────────────────────────────────
async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   WAQF IA — Scraper montants officiels belges            ║');
  console.log('║   Démarrage : ' + new Date().toLocaleString('fr-BE').padEnd(44) + '║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');

  const scrapers = [
    { fn: scraperRIS,           nom: 'RIS' },
    { fn: scraperHandicap,      nom: 'Handicap' },
    { fn: scraperAPA,           nom: 'APA' },
    { fn: scraperGRAPA,         nom: 'GRAPA' },
    { fn: scraperBIM,           nom: 'BIM' },
    { fn: scraperChomage,       nom: 'Chômage' },
    { fn: scraperAFBruxelles,   nom: 'AF Bruxelles' },
    { fn: scraperAFWallonie,    nom: 'AF Wallonie' },
    { fn: scraperNaissance,     nom: 'Primes naissance' },
    { fn: scraperLoyerBruxelles,nom: 'Loyer Bruxelles' },
    { fn: scraperLoyerWallonie, nom: 'Loyer Wallonie' },
    { fn: scraperTelecom,       nom: 'Télécom' },
    { fn: scraperMazout,        nom: 'Mazout' },
  ];

  for (const { fn, nom } of scrapers) {
    try {
      await fn();
    } catch (e) {
      log('💥', `Erreur critique ${nom}: ${e.message}`);
    }
    await sleep(DELAY_MS);
  }

  genererFichier();
  afficherRapport();
  
  console.log('💡 Prochaines étapes :');
  console.log('   1. Intégrez montants_officiels.js dans votre HTML (avant aides.js)');
  console.log('   2. Le moteur lira window.MONTANTS_OFFICIELS pour les calculs');
  console.log('   3. Relancez ce script chaque trimestre ou après une annonce gouvernementale');
  console.log('   4. Configurez un cron job : 0 9 1 1,4,7,10 * node /chemin/scraper.js\n');
}

main().catch(console.error);
