/**
 * Correspondance entre les numéros de compte du Plan Comptable Général (PCG)
 * français et des libellés lisibles (français "civil").
 *
 * Utilisé pour l'affichage des charges importées depuis K FACTORY / exports
 * comptables — l'utilisateur final ne voit plus "60614000" mais "Carburant".
 *
 * Sources:
 *  - Plan Comptable Général français (classe 2 = immobilisations, classe 6 = charges)
 *  - Conventions observées dans le fichier K FACTORY_achats.xlsx
 *
 * Quand le compte est multi-valué (ex: "60110000, 62410000"), on prend le
 * libellé du premier compte et on ajoute " (compte mixte)".
 */

const PCG_LABELS: Record<string, string> = {
  // === Classe 2 — Immobilisations ===
  '20121000': 'Frais de constitution',
  '20122000': 'Frais de recherche & développement',
  '20510000': 'Logiciels & abonnements (immobilisation)',
  '21500000': 'Installations techniques & matériel',
  '21820000': 'Matériel informatique',
  '21830000': 'Mobilier',
  '21831000': 'Mobilier & équipements',

  // === Classe 4 — Comptes tiers (cas isolés) ===
  '47100000': "Compte d'attente",

  // === Classe 6 — Comptes de charges ===
  // 60 — Achats
  '60110000': 'Achats matières premières',
  '60210000': 'Achats fournitures',
  '60220000': 'Fournitures de bureau',
  '60222000': 'Fournitures de bureau',
  '60223000': "Fournitures d'entretien",
  '60224000': 'Fournitures diverses',
  '60225000': 'Fournitures de bureau',
  '60226000': "Fournitures d'atelier",
  '60260000': 'Emballages & conditionnements',
  '60400000': 'Études & prestations de services',
  '60410000': 'Travaux sous-traités',
  '60500000': 'Achats de matériel & équipements',
  '60611000': 'Énergie — Eau & électricité',
  '60614000': 'Carburant',
  '60630000': 'Petit outillage & consommables',
  '60640000': 'Fournitures médicales & santé',
  '60680000': 'Autres matières & fournitures',
  '60900000': 'Remises & rabais sur achats',
  '60940000': 'Remises & rabais sur achats',

  // 61 — Services extérieurs
  '61110000': 'Locations immobilières',
  '61320000': 'Loyer immobilier',
  '61330000': 'Locations immobilières (variantes)',
  '61350000': 'Locations de matériel',
  '61351000': 'Locations de matériel',
  '61352000': 'Locations de matériel de transport',
  '61400000': 'Charges locatives & de copropriété',
  '61500000': "Entretien & réparations",
  '61520000': 'Maintenance — bâtiment & locaux',
  '61550000': 'Maintenance — matériel',
  '61551000': 'Maintenance — matériel & outillage',
  '61600000': "Primes d'assurance",
  '61610000': "Primes d'assurance",
  '61700000': 'Études & recherches',
  '61810000': "Travaux d'aménagement",
  '61820000': 'Travaux immobiliers',
  '61830000': 'Sous-traitance',
  '61850000': 'Sous-traitance',

  // 62 — Personnel extérieur & autres services
  '62200000': "Personnel extérieur à l'entreprise",
  '62210000': 'Personnel extérieur — rémunérations',
  '62228000': 'Frais bancaires & financiers',
  '62240000': 'Personnel intérimaire',
  '62260000': 'Honoraires',
  '62268000': 'Frais bancaires & financiers',
  '62270000': 'Déplacements & missions',
  '62280000': 'Divers services',

  // 62.3 — Publicité, publications, relations publiques
  '62300000': 'Publicité, publications & relations publiques',
  '62330000': 'Annonces & insertions publicitaires',
  '62360000': 'Catalogues, imprimés & brochures',
  '62370000': 'Publications',
  '62380000': 'Autres biens & services publicitaires',

  // 62.4 — Transports
  '62410000': 'Transport sur ventes',
  '62420000': 'Transport sur achats',
  '62430000': 'Transport entre établissements',

  // 62.5 — Déplacements, missions, repas
  '62500000': 'Déplacements & missions',
  '62510000': 'Voyages & déplacements',
  '62520000': 'Divers — déplacements',
  '62550000': 'Frais de réception',
  '62570000': 'Repas & restauration',

  // 62.6 — Frais postaux & télécom
  '62600000': 'Frais postaux',
  '62610000': 'Téléphone',
  '62620000': 'Télécommunications & hébergement',

  // 62.8 — Autres services extérieurs
  '62810000': 'Concours publicitaires',
  '62811000': 'Concours publicitaires',
  '62820000': 'Honoraires juridiques & comptables',

  // 63 — Impôts, taxes & versements assimilés
  '63580000': 'Autres impôts & taxes',

  // 64 — Charges de personnel
  '64750000': 'Médecine du travail & santé au travail',

  // Fallback "Autres" pour les entrées non mappées
  'Autres': 'Autres charges',
};

/**
 * Renvoie le libellé lisible associé à un numéro de compte (ou une chaîne
 * contenant plusieurs comptes séparés par des virgules).
 *
 * Si la chaîne contient plusieurs comptes (ex: "60110000, 62410000"), renvoie
 * le libellé du premier compte suivi de " (compte mixte)".
 *
 * Si le compte n'est pas dans la table, renvoie la chaîne d'origine (pour ne
 * pas perdre l'information).
 */
export function labelForCompte(compte: string | null | undefined): string {
  if (!compte) return 'Autres charges';
  const raw = compte.trim();
  if (!raw) return 'Autres charges';

  // Si plusieurs comptes séparés par des virgules
  if (raw.includes(',')) {
    const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
    const first = parts[0];
    const label = PCG_LABELS[first] ?? first;
    return `${label} (compte mixte)`;
  }

  // Cas simple: compte unique
  return PCG_LABELS[raw] ?? raw;
}

/**
 * Renvoie le numéro de compte original à partir d'une catégorie (qui peut
 * être un libellé lisible si la migration a été faite, ou un numéro brut
 * sinon). Utilisé pour afficher le numéro de compte en sous-texte.
 */
export function rawCompteFromCategory(category: string | null | undefined): string | null {
  if (!category) return null;
  // Si la catégorie ressemble à un numéro de compte (chiffres uniquement + virgules/espaces)
  if (/^[\d\s,]+$/.test(category)) return category;
  // Si c'est un libellé "Label (compte mixte)", on ne peut pas récupérer
  // le numéro original sans refaire le mapping inverse — on renvoie null
  return null;
}

/**
 * Détermine si une catégorie de charge est DIRECTE ou INDIRECTE selon les
 * principes de la comptabilité analytique française.
 *
 * Charges DIRECTES = charges qu'on peut affecter sans calcul intermédiaire
 * à un coût (production, vente). Ce sont les charges opérationnelles
 * directement liées à l'activité : matières premières, emballages, transport
 * sur ventes.
 *
 * Charges INDIRECTES = charges de structure qui nécessitent une répartition
 * (loyer, électricité, salaires, honoraires, frais bancaires, etc.)
 *
 * Le paramètre est le libellé lisible (déjà converti depuis le numéro de
 * compte par labelForCompte).
 */
export function isChargeDirecte(categoryLabel: string | null | undefined): boolean {
  if (!categoryLabel) return false;
  const l = categoryLabel.toLowerCase();

  // === Charges DIRECTES (liées à la production/vente) ===
  // 601 — Achats matières premières (ingredients des cookies vendus)
  if (l.includes('achats matières premières')) return true;
  // 6026 — Emballages & conditionnements (packaging des produits vendus)
  if (l.includes('emballage') || l.includes('conditionnement')) return true;
  // 6241 — Transport sur ventes (livraison aux clients)
  if (l.includes('transport sur ventes')) return true;
  // 604 — Études & prestations liées à la production
  if (l.includes('études & prestations') && !l.includes('compte mixte')) return true;
  // 605 — Achats de matériel & équipements (pour production)
  if (l.includes('achats de matériel')) return true;

  // === Tout le reste = INDIRECT (charges de structure) ===
  // Loyer, électricité, carburant, salaires, intérim, honoraires, frais
  // bancaires, déplacements, téléphone, assurances, entretien, marketing,
  // logiciels, mobilier, etc.
  return false;
}

/**
 * Renvoie une catégorie "racine" simplifiée pour grouper les charges.
 * Par exemple, tous les "Transport sur ventes", "Transport sur achats" et
 * "Transport entre établissements" sont groupés sous "Transport".
 *
 * Cette fonction est utilisée pour la répartition par grand poste analytique.
 */
export function grandPosteForCategory(label: string | null | undefined): string {
  if (!label) return 'Autres';
  const l = label.toLowerCase();
  if (l.includes('transport')) return 'Transport';
  if (l.includes('carburant')) return 'Carburant';
  if (l.includes('loyer') || l.includes('immobil') || l.includes('location')) return 'Loyer & locations';
  if (l.includes('emballage') || l.includes('conditionnement')) return 'Emballages';
  if (l.includes('achat') && l.includes('matière')) return 'Achats matières premières';
  if (l.includes('fourniture')) return 'Fournitures';
  if (l.includes('énergie') || l.includes('eau & électricité')) return 'Énergie';
  if (l.includes('intérim') || l.includes('personnel')) return 'Personnel extérieur';
  if (l.includes('honoraire') || l.includes('juridique') || l.includes('comptable')) return 'Honoraires';
  if (l.includes('publicit') || l.includes('annonce') || l.includes('catalogue') || l.includes('publication') || l.includes('concours')) return 'Marketing & publicité';
  if (l.includes('déplacement') || l.includes('voyage') || l.includes('mission')) return 'Déplacements & missions';
  if (l.includes('repas') || l.includes('restauration') || l.includes('réception')) return 'Repas & réception';
  if (l.includes('téléphone') || l.includes('télécom') || l.includes('postaux') || l.includes('hébergement')) return 'Télécom & postaux';
  if (l.includes('bancaire') || l.includes('financier') || l.includes('intérêt')) return 'Frais financiers';
  if (l.includes('assurance')) return 'Assurances';
  if (l.includes('entretien') || l.includes('maintenance') || l.includes('réparation')) return 'Entretien & maintenance';
  if (l.includes('travaux') || l.includes('aménagement') || l.includes('immobilier')) return 'Travaux & immobilier';
  if (l.includes('sous-traitance')) return 'Sous-traitance';
  if (l.includes('logiciel') || l.includes('abonnement')) return 'Logiciels & abonnements';
  if (l.includes('matériel') || l.includes('mobilier') || l.includes('outillage')) return 'Matériel & outillage';
  if (l.includes('études') || l.includes('recherche')) return 'Études & prestations';
  if (l.includes('impôt') || l.includes('taxe')) return 'Impôts & taxes';
  if (l.includes('médecine') || l.includes('santé')) return 'Médecine du travail';
  return 'Autres';
}
