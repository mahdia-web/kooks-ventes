/**
 * Normalise un nom d'enseigne pour la détection de doublons intelligente.
 *
 * Objectif : identifier les mêmes magasins avec des écritures différentes.
 *
 * Exemples :
 *   "SAS O'TERA - AMIENS"  →  "OTERA AMIENS"
 *   "O'TERA AMIENS"        →  "OTERA AMIENS"
 *   "SAS OTERA AMIENS"     →  "OTERA AMIENS"
 *   "SOCIETE COOPERATIVE D'APPROVISIONNEMENT DE L'OUEST"  →  "SCAOUEST"
 *   "SA CENTRA APPROVI CHARENT POITOU ( SCACHAP )"        →  "CENTRA APPROVI CHARENT POITOU SCACHAP"
 *   "SARL SARL SODISUD  HYPER U LA MONTAGNE"              →  "SODISUD HYPER U LA MONTAGNE"
 *
 * Cas spéciaux gérés :
 *   - "SOCIETE COOPERATIVE D'APPROVISIONNEMENT PARIS-EST (CHALONS)"
 *     = "SOCIETE COOPERATIVE D'APPROVISIONNEMENT PARIS-EST (SCAPEST - CHALLON EN CHAMPAGNE)"
 *     → "SCAPEST CHALONS"
 *   - "MONOPRIX" = "MONOPRIX PARIS 15" = "MONOPRIX (PARIS 15)"  (suffixe ville gardé,
 *     car les Monoprix sont des magasins distincts — mais le préfixe est identique)
 *
 * IMPORTANT : la normalisation ne doit PAS confondre des magasins différents
 * qui appartiennent à la même coopérative. Par exemple :
 *   "LECLERC SCAOUEST ( SAS BLAINDIS)"  ≠  "LECLERC SCAOUEST SAINT HERBLAIN DISTRIBUTION"
 * bien que les deux contiennent "SCAOUEST" — ce sont deux magasins physiques distincts.
 */

/** Ville synonyms : noms de villes avec variantes d'écriture → forme canonique */
const CITY_SYNONYMS: Array<[RegExp, string]> = [
  // CHALLON / CHALONS / CHALONS EN CHAMPAGNE
  [/\bCHALONS\s+EN\s+CHAMPAGNE\b/g, 'CHALONS'],
  [/\bCHALLON\s+EN\s+CHAMPAGNE\b/g, 'CHALONS'],
  [/\bCHALONS\s+SUR\s+MARNE\b/g, 'CHALONS'],
  // Saint-étienne variants
  [/\bSAINT\s+ETIENNE\b/g, 'ST ETIENNE'],
  [/\bSTE?\s+ETIENNE\b/g, 'ST ETIENNE'],
  // Saint-herblain
  [/\bSAINT\s+HERBLAIN\b/g, 'ST HERBLAIN'],
  [/\bSTE?\s+HERBLAIN\b/g, 'ST HERBLAIN'],
  // Sainte-eulalie
  [/\bSAINTE\s+EULALIE\b/g, 'STE EULALIE'],
  [/\bSTE\s+EULALIE\b/g, 'STE EULALIE'],
  [/\bSTE?\s+EULALIE\b/g, 'STE EULALIE'],
];

/** Coopérative long forms → acronyme */
const COOP_ACRONYMS: Array<[RegExp, string]> = [
  [/SOCIETE\s+COOPERATIVE\s+D'?APPROVISIONNEMENT\s+DE\s+L'?OUEST\b/g, 'SCAOUEST'],
  [/SOCIETE\s+COOPERATIVE\s+D'?APPROVISIONNEMENT\s+PARIS\s*-?\s*EST\b/g, 'SCAPEST'],
  [/SOCIETE\s+COOPERATIVE\s+D'?APPROVISIONNEMENT\s+DU\s+PAYS\s+DE\s+RETZ\b/g, 'SCAPDR'],
  [/SOCIETE\s+COOPERATIVE\s+D'?APPROVISIONNEMENT\s+RHONE\s*-?\s*ALPES\b/g, 'SCARA'],
  [/SOCIETE\s+COOPERATIVE\s+D'?APPROVISIONNEMENT\s+ILE\s+DE\s+FRANCE\b/g, 'SCADIF'],
  [/SOC\s+COOP\s+APPROVISIONNEMENT\s+PARIS\s*NORD\b/g, 'SCAPNOR'],
  [/SOC\s+COOP\s+APPROVISIONNEMENT\s+ILE\s+DE\s+FRANCE\b/g, 'SCADIF'],
  // Formes courtes déjà acronymes — on garde
  [/\bSCAPEST\b/g, 'SCAPEST'],
  [/\bSCAOUEST\b/g, 'SCAOUEST'],
  [/\bSCACHAP\b/g, 'SCACHAP'],
  [/\bSCADIF\b/g, 'SCADIF'],
  [/\bALDOUEST\b/g, 'ALDOUEST'],
];

/** Tokens vides (bruit) à supprimer totalement */
const NOISE_TOKENS = new Set([
  'SAS', 'SARL', 'EURL', 'SASU', 'SA',  // formes juridiques
  'SOCIETE', 'COOPERATIVE', 'APPROVISIONNEMENT',  // mots longs des coopératives
  'PAR', 'LE', 'LA', 'LES', 'DE', 'DU', 'DES', 'ET', // petits mots (pour le dédoublonnage final)
  'DISTRIBUTION', 'DIST', 'DIST.', 'HYPER', 'HYPERMARCHE', 'SUPER', 'SUPERMARCHE',
  'MAGASIN', 'STORE', 'SASUE',
  'EN', 'SUR',
]);

export function normalizeEnseigne(name: string): string {
  if (!name) return '';
  let n = name.toUpperCase().trim();

  // 1. Formes longues coopératives → acronyme (avant tout, pour matcher D'APPROVI)
  for (const [re, acr] of COOP_ACRONYMS) {
    n = n.replace(re, ` ${acr} `);
  }

  // 2. Synonymes de villes
  for (const [re, canonical] of CITY_SYNONYMS) {
    n = n.replace(re, canonical);
  }

  // 3. Joindre les lettres séparées par apostrophe (O'TERA → OTERA)
  for (let i = 0; i < 3; i++) {
    const before = n;
    n = n.replace(/(\w)'(\w)/g, '$1$2');
    if (n === before) break;
  }

  // 3b. Joindre les acronymes pointés : "S.C.A." → "SCA", "S.A.R.L." → "SARL"
  //     On enlève le point entre une lettre majuscule et la lettre majuscule suivante.
  //     On boucle car plusieurs points peuvent être successifs.
  for (let i = 0; i < 5; i++) {
    const before = n;
    n = n.replace(/([A-Z])\.(?=[A-Z])/g, '$1');
    if (n === before) break;
  }
  // 3c. Pareil pour les points finaux d'acronyme suivis d'un espace : "SCA. PARIS" → "SCA PARIS"
  //     (mais pas "DEC.2024" car pas un espace après le point)
  n = n.replace(/([A-Z])\.\s+/g, '$1 ');

  // 4. Tout ce qui n'est pas alphanumérique devient espace
  n = n.replace(/['’`._\-(),]/g, ' ');

  // 5. Supprimer les préfixes juridiques au début (et leurs répétitions)
  n = n.replace(/^(SARL\s+)+(SAS|SA|SARL|EURL|SASU)\s+/g, '');
  n = n.replace(/^(SAS|SA|SARL|EURL|SASU)\s+/g, '');

  // 6. Collapser les espaces multiples
  n = n.replace(/\s+/g, ' ').trim();

  // 7. Supprimer les tokens de bruit (formes juridiques dispersées, etc.)
  //    On conserve les villes (PARIS, LYON, etc.) qui sont signifiantes
  const tokens = n.split(' ').filter((t) => t.length > 0);
  const cleaned = tokens.filter((t) => {
    // Toujours supprimer SA/SAS/SARL apparaissant n'importe où
    if (['SAS', 'SARL', 'EURL', 'SASU'].includes(t)) return false;
    // "SA" est ambigu — on ne supprime que s'il est isolé en début de chaîne
    // (sinon ça pourrait casser STE EULALIE → STEULALIE)
    return true;
  });

  // 8. Dédoublonner les tokens consécutifs ET globaux
  //    Exemple: "SCAPEST SCAPEST CHALONS" → "SCAPEST CHALONS"
  //             "OTERA AMIENS OTERA"     → "OTERA AMIENS"
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const t of cleaned) {
    if (!seen.has(t)) {
      seen.add(t);
      deduped.push(t);
    }
  }

  return deduped.join(' ').trim();
}

/**
 * Calcule un score de similarité entre deux noms normalisés (0 = différents, 1 = identiques).
 * Utilisé pour suggérer des fusions possibles même quand les noms ne sont pas parfaitement
 * identiques après normalisation.
 *
 * Stratégie :
 *   1. Si normalisation exacte → 1.0
 *   2. Sinon, score de Jaccard sur les mots normalisés
 *   3. Bonus si le 1er token (qui contient souvent la marque principale) est identique
 */
export function similarityScore(a: string, b: string): number {
  const na = normalizeEnseigne(a);
  const nb = normalizeEnseigne(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const wa = na.split(' ').filter(Boolean);
  const wb = nb.split(' ').filter(Boolean);
  if (wa.length === 0 || wb.length === 0) return 0;

  // Jaccard
  const sa = new Set(wa);
  const sb = new Set(wb);
  let inter = 0;
  for (const w of sa) if (sb.has(w)) inter++;
  const union = sa.size + sb.size - inter;
  const jaccard = union === 0 ? 0 : inter / union;

  // Bonus si le 1er token (souvent la marque "MONOPRIX", "OTERA", "AUCHAN") matche
  const firstMatch = wa[0] === wb[0] ? 0.15 : 0;

  // Bonus si la marque principale (token le plus long) matche
  const longestA = wa.reduce((m, t) => (t.length > m.length ? t : m), '');
  const longestB = wb.reduce((m, t) => (t.length > m.length ? t : m), '');
  const brandMatch = longestA && longestA === longestB ? 0.1 : 0;

  return Math.min(1, jaccard + firstMatch + brandMatch);
}

/**
 * Détecte si un nom est probablement une coopérative (Centrale).
 * Utilisé pour auto-détection du type Centrale.
 */
export function isCooperativeName(name: string): boolean {
  const n = normalizeEnseigne(name);
  const coopTokens = ['SCAPEST', 'SCAOUEST', 'SCACHAP', 'SCADIF', 'SCAPNOR', 'SCAPDR', 'SCARA', 'ALDOUEST', 'OTERA'];
  return coopTokens.some((t) => n.includes(t));
}

/**
 * Pour un import de ventes : étant donné un nom d'enseigne entrant et la liste
 * des enseignes déjà en base, retourne le nom canonique à utiliser.
 *
 * Stratégie :
 *   1. Match exact (case-sensitive après trim) → utiliser tel quel
 *   2. Sinon, calculer normalizeEnseigne pour chaque enseigne en base
 *   3. Si normalizeEnseigne(entrant) === normalizeEnseigne(existing) → utiliser existing.name
 *   4. Sinon, si similarityScore >= 0.85 → utiliser existing.name (le plus ancien / canonique)
 *   5. Sinon, créer une nouvelle enseigne avec le nom entrant
 *
 * Retourne { canonicalName, matchedExisting, confidence }
 */
export function resolveCanonicalName(
  incomingName: string,
  existingNames: string[],
): { canonicalName: string; matchedExisting: string | null; confidence: number } {
  if (!incomingName?.trim()) {
    return { canonicalName: '', matchedExisting: null, confidence: 0 };
  }
  const trimmed = incomingName.trim();

  // 1. Match exact (insensible à la casse)
  const exactMatch = existingNames.find(
    (n) => n.toLowerCase().trim() === trimmed.toLowerCase(),
  );
  if (exactMatch) {
    return { canonicalName: exactMatch, matchedExisting: exactMatch, confidence: 1 };
  }

  // 2. Match par normalisation exacte
  const incomingNorm = normalizeEnseigne(trimmed);
  if (incomingNorm) {
    const normMatch = existingNames.find(
      (n) => normalizeEnseigne(n) === incomingNorm,
    );
    if (normMatch) {
      return { canonicalName: normMatch, matchedExisting: normMatch, confidence: 0.95 };
    }
  }

  // 3. Match par similarité (seuil élevé pour éviter faux positifs)
  let bestMatch: string | null = null;
  let bestScore = 0;
  for (const n of existingNames) {
    const score = similarityScore(trimmed, n);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = n;
    }
  }
  if (bestMatch && bestScore >= 0.85) {
    return { canonicalName: bestMatch, matchedExisting: bestMatch, confidence: bestScore };
  }

  // 4. Aucun match : nom canonique = nom entrant (nouveau client)
  return { canonicalName: trimmed, matchedExisting: null, confidence: 0 };
}
