/**
 * Règles de reclassification des charges basées sur le nom du fournisseur.
 *
 * Le numéro de compte comptable (PCG) ne reflète pas toujours la nature
 * réelle de la dépense. Par exemple, SARL AGENCE BROCARD est classé
 * « Frais bancaires & financiers » par son compte, alors qu'il s'agit en
 * réalité d'une commission d'agent commercial. Ce module corrige ces cas en
 * se basant sur le nom du fournisseur, qui est plus parlant que le compte.
 *
 * La catégorie renvoyée est un libellé lisible cohérent avec
 * compte-comptable.ts (labelForCompte) pour que les charges reclassées se
 * regroupent proprement avec les charges déjà bien catégorisées.
 *
 * Comment ajouter une règle : compléter le tableau VENDOR_RULES ci-dessous.
 * Chaque règle = { match (tableau de mots-clés normalisés), category, note }.
 * La première règle qui matche gagne (l'ordre a donc son importance).
 */

export interface VendorRule {
  /** Mots-clés (en minuscules, sans accents) à chercher dans le nom du
   *  fournisseur. La règle s'applique si l'un des mots-clés est inclus. */
  match: string[];
  /** Catégorie lisible cible (cohérente avec labelForCompte). */
  category: string;
  /** Courte explication humaine (pour les logs / notifications). */
  note?: string;
}

/**
 * Règles de reclassification par fournisseur.
 * L'ordre compte : la première règle dont un mot-clé matche s'applique.
 */
export const VENDOR_RULES: VendorRule[] = [
  // === Commissions d'agents commerciaux ===
  // SARL AGENCE BROCARD est un agent commercial rémunéré à la commission,
  // pas une charge bancaire (son compte comptable est trompeur).
  {
    match: ['brocard'],
    category: 'Honoraires',
    note: 'Commission agent commercial (Brocard)',
  },

  // === Promo / marketing / salons ===
  // HIGHCODATA : agence de communication digitale (promo).
  // MONOPRIX : ici ce sont des factures de promo / mise en avant en magasin.
  // SCADIF : coopérative d'approvisionnement — factures de salons / promo.
  {
    match: ['highcodata', 'highco data', 'highco'],
    category: 'Marketing & publicité',
    note: 'Promo digitale (HIGHCODATA)',
  },
  {
    match: ['monoprix'],
    category: 'Marketing & publicité',
    note: 'Promo / mise en avant en magasin (Monoprix)',
  },
  {
    match: ['scadif'],
    category: 'Marketing & publicité',
    note: 'Promo / salon (SCADIF)',
  },

  // === Transport / logistique ===
  // Ces fournisseurs ont été importés sous « Personnel intérimaire » à tort
  // (leur compte comptable était 62240000). Il s'agit en réalité de transport
  // et de logistique pour livraison des produits aux clients.
  {
    match: ['chronofresh', 'chrono fresh', 'chrono'],
    category: 'Transport sur ventes',
    note: 'Transport livraison (Chronofresh)',
  },
  {
    match: ['samada'],
    category: 'Transport sur ventes',
    note: 'Transport livraison (Samada)',
  },
  {
    match: ['ecolise'],
    category: 'Transport sur ventes',
    note: 'Transport livraison (Ecolise)',
  },
  // STG : transport / logistique (pas intérim).
  {
    match: ['stg'],
    category: 'Transport sur ventes',
    note: 'Transport livraison (STG)',
  },

  // === Préparateur de commande / stockage ===
  // SUPPLYFRESH : préparation des commandes + stockage des produits.
  // C'est un service logistique directement lié à l'activité de vente.
  {
    match: ['supplyfresh', 'supply fresh', 'supply-fresh'],
    category: 'Transport sur ventes',
    note: 'Préparation commande & stockage (Supply Fresh)',
  },
];

/**
 * Normalise une chaîne : minuscules, sans accents, sans apostrophes,
 * espaces regroupés. Utilisé pour la comparaison insensible à la casse
 * et aux accents.
 */
function normalize(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface ReclassifyResult {
  /** Nouvelle catégorie, ou null si aucune règle ne matche. */
  category: string | null;
  /** Règle qui a matché, ou null si aucune. */
  rule: VendorRule | null;
  /** True si une reclassification est nécessaire. */
  changed: boolean;
}

/**
 * Cherche la catégorie à appliquer pour un fournisseur donné, selon les
 * règles VENDOR_RULES. Renvoie aussi la règle qui a matché (pour les logs)
 * et un flag `changed` indiquant si la catégorie diffère de l'actuelle.
 *
 * @param vendor Nom du fournisseur (ex: "SARL AGENCE BROCARD")
 * @param currentCategory Catégorie actuelle de la charge (pour comparer)
 */
export function reclassifyByVendor(
  vendor: string | null | undefined,
  currentCategory: string | null | undefined,
): ReclassifyResult {
  if (!vendor || !vendor.trim()) {
    return { category: null, rule: null, changed: false };
  }
  const normalizedVendor = normalize(vendor);
  for (const rule of VENDOR_RULES) {
    const matched = rule.match.some((kw) => normalizedVendor.includes(normalize(kw)));
    if (matched) {
      const changed = (currentCategory ?? '') !== rule.category;
      return { category: rule.category, rule, changed };
    }
  }
  return { category: null, rule: null, changed: false };
}

/**
 * Liste les fournisseurs connus par les règles (pour affichage / debug).
 */
export function knownVendors(): string[] {
  return VENDOR_RULES.flatMap((r) => r.match);
}
