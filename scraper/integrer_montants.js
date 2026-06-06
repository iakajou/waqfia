/**
 * INTEGRER_MONTANTS.JS
 * ====================
 * Après avoir lancé scraper.js, lancez ce script pour 
 * mettre à jour automatiquement le fichier moteur.js 
 * avec les nouveaux montants.
 * 
 * Usage : node integrer_montants.js
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const montantsPath = path.join(__dirname, 'montants_officiels.json');
const moteurPath   = path.join(__dirname, '..', 'moteur.js'); // adapte ce chemin

if (!fs.existsSync(montantsPath)) {
  console.error('❌ montants_officiels.json non trouvé. Lance d\'abord scraper.js');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(montantsPath, 'utf8'));
const M    = data.montants;

console.log(`\n📋 Intégration des montants du ${new Date(data.date_scraping).toLocaleDateString('fr-BE')}`);
console.log(`   Fiabilité : ${data.sources_ok.length}/${data.sources_ok.length + data.sources_echec.length} sources OK\n`);

// Afficher un résumé des montants qui vont être intégrés
const resume = [
  ['RIS isolé·e / chef de ménage', M.ris?.isole_chef_menage + ' €', M.ris?.fiabilite],
  ['RIS cohabitant·e',             M.ris?.cohabitant + ' €',        M.ris?.fiabilite],
  ['GRAPA isolé·e',                M.grapa?.isole + ' €',           M.grapa?.fiabilite],
  ['GRAPA cohabitant·e',           M.grapa?.cohabitant + ' €',      M.grapa?.fiabilite],
  ['Handicap cat3 (référence)',     M.allocation_handicap?.cat3 + ' €', M.allocation_handicap?.fiabilite],
  ['Handicap cat5 (max)',           M.allocation_handicap?.cat5 + ' €', M.allocation_handicap?.fiabilite],
  ['APA cat5 (max)',                M.apa?.cat5 + ' €',              M.apa?.fiabilite],
  ['AF Bruxelles 1er enfant',      M.af_bruxelles?.enfant_1 + ' €', M.af_bruxelles?.fiabilite],
  ['AF Wallonie 1er enfant',       M.af_wallonie?.enfant_1 + ' €',  M.af_wallonie?.fiabilite],
  ['Loyer Bruxelles max',          M.loyer_bruxelles?.montant_max + ' €', M.loyer_bruxelles?.fiabilite],
  ['Loyer Wallonie max',           M.loyer_wallonie?.montant_max + ' €',  M.loyer_wallonie?.fiabilite],
  ['Télécom fixe max',             M.telecom?.telephone_fixe_max + ' €', M.telecom?.fiabilite],
  ['Internet social max',          M.telecom?.internet_fixe_max + ' €',  M.telecom?.fiabilite],
  ['Mazout réduction/litre',       M.fonds_mazout?.reduction_par_litre + ' €', M.fonds_mazout?.fiabilite],
];

resume.forEach(([label, val, fiab]) => {
  const icon = fiab === 'scraped' ? '✅' : fiab === 'partial' ? '⚠️ ' : '❌';
  console.log(`  ${icon} ${label.padEnd(35)} ${val}`);
});

// Générer le bloc de constantes à injecter dans moteur.js
const bloc = `
  /* ─── MONTANTS OFFICIELS (mis à jour le ${new Date(data.date_scraping).toLocaleDateString('fr-BE')}) ─────────
     Généré automatiquement par scraper.js
     Fiabilité : ${data.sources_ok.length}/${data.sources_ok.length + data.sources_echec.length} sources scraped
  ──────────────────────────────────────────────────────── */
  var S = {
    // RIS (${M.ris?.fiabilite})
    ris_isole:         ${M.ris?.isole_chef_menage},
    ris_cohabitant:    ${M.ris?.cohabitant},
    ris_chef_menage:   ${M.ris?.isole_chef_menage},
    // GRAPA (${M.grapa?.fiabilite})
    grapa_isole:       ${M.grapa?.isole},
    grapa_couple:      ${M.grapa?.cohabitant},
    // BIM / OMNIO — revenus BRUTS annuels (${M.bim?.fiabilite})
    bim_isole_annuel:  ${M.bim?.seuil_isole_annuel},
    bim_par_enfant:    ${M.bim?.supplement_par_enfant},
    // Allocation loyer RBC (${M.loyer_bruxelles?.fiabilite})
    loyer_rbc_max:     ${M.loyer_bruxelles?.montant_max},
    loyer_rbc_plafond_isole: ${M.loyer_bruxelles?.plafond_revenus_isole},
    // Allocation loyer Wallonie (${M.loyer_wallonie?.fiabilite})
    loyer_wall_max:    ${M.loyer_wallonie?.montant_max},
    loyer_wall_plafond_isole: ${M.loyer_wallonie?.plafond_revenus_isole},
    // Plafonds communs loyer
    loyer_1p:  ${M.loyer_bruxelles?.plafond_revenus_isole || 1580.09},
    loyer_2p:  ${Math.round((M.loyer_bruxelles?.plafond_revenus_isole||1580.09) * 1.245 * 100)/100},
    loyer_3p:  ${Math.round((M.loyer_bruxelles?.plafond_revenus_isole||1580.09) * 1.524 * 100)/100},
    // Chômage (${M.chomage?.fiabilite})
    chomage_plafond_isole:     ${M.chomage?.plafond_isole_chef_menage},
    chomage_plafond_cohabitant: ${M.chomage?.plafond_cohabitant},
    // Handicap (${M.allocation_handicap?.fiabilite})
    handicap_cat1: ${M.allocation_handicap?.cat1},
    handicap_cat2: ${M.allocation_handicap?.cat2},
    handicap_cat3: ${M.allocation_handicap?.cat3},
    handicap_cat4: ${M.allocation_handicap?.cat4},
    handicap_cat5: ${M.allocation_handicap?.cat5},
    // APA (${M.apa?.fiabilite})
    apa_cat1: ${M.apa?.cat1},
    apa_cat2: ${M.apa?.cat2},
    apa_cat3: ${M.apa?.cat3},
    apa_cat4: ${M.apa?.cat4},
    apa_cat5: ${M.apa?.cat5},
    // Allocations familiales Bruxelles (${M.af_bruxelles?.fiabilite})
    af_bxl_e1:    ${M.af_bruxelles?.enfant_1},
    af_bxl_e2:    ${M.af_bruxelles?.enfant_2},
    af_bxl_e3p:   ${M.af_bruxelles?.enfant_3plus},
    af_bxl_supp:  ${M.af_bruxelles?.supplement_social},
    // Allocations familiales Wallonie (${M.af_wallonie?.fiabilite})
    af_wall_e1:   ${M.af_wallonie?.enfant_1},
    af_wall_e2:   ${M.af_wallonie?.enfant_2},
    af_wall_e3p:  ${M.af_wallonie?.enfant_3plus},
    af_wall_supp: ${M.af_wallonie?.supplement_social},
    // Primes naissance
    naissance_bxl_1er:   ${M.prime_naissance_bxl?.premier},
    naissance_bxl_suiv:  ${M.prime_naissance_bxl?.suivants},
    naissance_wall_1er:  ${M.prime_naissance_wall?.premier},
    naissance_wall_suiv: ${M.prime_naissance_wall?.suivants},
    // Télécom (${M.telecom?.fiabilite})
    telecom_tel_max:  ${M.telecom?.telephone_fixe_max},
    telecom_inet_max: ${M.telecom?.internet_fixe_max},
    // Mazout (${M.fonds_mazout?.fiabilite})
    mazout_reduction: ${M.fonds_mazout?.reduction_par_litre},
    mazout_plafond_l: ${M.fonds_mazout?.plafond_litres},
    // Divers (stables, pas besoin de scraping)
    monop_revenu_max:         1852,
    supp_wall_revenu_max:     2665,
    af_supplement_revenu_max: 2914,
    bourse_annuel_max:        31015,
    telecom_revenu_max:       1800,
    aide_juridique_gratuit:   1431.59,
    aide_juridique_partiel:   1849.16,
  };`;

console.log('\n📝 Bloc S (seuils) généré pour moteur.js :');
console.log('   Copiez le contenu ci-dessous dans moteur.js,');
console.log('   en remplaçant le bloc "var S = {" existant.\n');
console.log('─'.repeat(60));
console.log(bloc);
console.log('─'.repeat(60));

// Sauvegarder le bloc dans un fichier séparé
fs.writeFileSync(path.join(__dirname, 'bloc_seuils.js'), bloc, 'utf8');
console.log('\n✅ Bloc sauvegardé dans bloc_seuils.js');
console.log('   Collez son contenu dans moteur.js à la place de var S = {...}\n');
