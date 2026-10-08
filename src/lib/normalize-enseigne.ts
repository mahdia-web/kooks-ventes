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
 * IMPORTANT : la normalisation ne doit PAS confondre des magasins différents
 * qui appartiennent à la même coopérative. Par exemple :
 *   "LECLERC SCAOUEST ( SAS BLAINDIS)"  ≠  "LECLERC SCAOUEST SAINT HERBLAIN DISTRIBUTION"
 * bien que les deux contiennent "SCAOUEST" — ce sont deux magasins physiques distincts.
 */
export function normalizeEnseigne(name: string): string {
  let n = name.toUpperCase().trim();

  // 1. Formes longues → acronymes pour les coopératives (à faire en premier,
  //    avant la suppression des apostrophes, pour pouvoir matcher D'APPROVI)
  n = n.replace(
    /SOCIETE\s+COOPERATIVE\s+D'?APPROVISIONNEMENT\s+DE\s+L'?OUEST\b/g,
    'SCAOUEST'
  );
  n = n.replace(
    /SOCIETE\s+COOPERATIVE\s+D'?APPROVISIONNEMENT\s+PARIS\s*-?\s*EST\b/g,
    'SCAPAEST'
  );
  n = n.replace(
    /SOCIETE\s+COOPERATIVE\s+D'?APPROVISIONNEMENT\s+DU\s+PAYS\s+DE\s+RETZ\b/g,
    'SCAPDR'
  );

  // 2. Joindre les lettres séparées par apostrophe (O'TERA → OTERA, D'AVELIN → DAVELIN)
  //    On boucle car on peut avoir des cas comme D'L'OUEST
  for (let i = 0; i < 3; i++) {
    const before = n;
    n = n.replace(/(\w)'(\w)/g, '$1$2');
    if (n === before) break;
  }

  // 3. Remplacer toute la ponctuation restante par des espaces
  n = n.replace(/['’`._\-(),]/g, ' ');

  // 4. Supprimer les préfixes d'entité juridique (SA, SAS, SARL, EURL, SASU)
  //    Pattern: au début, éventuellement répété (ex: "SARL SARL SODISUD")
  n = n.replace(/^(SARL\s+)+(SAS|SA|SARL|EURL|SASU)\s+/g, '');
  n = n.replace(/^(SAS|SA|SARL|EURL|SASU)\s+/g, '');

  // 5. Collapser les espaces multiples et trim
  n = n.replace(/\s+/g, ' ').trim();

  return n;
}

/**
 * Calcule un score de similarité entre deux noms normalisés (0 = différents, 1 = identiques).
 * Utilisé pour suggérer des fusions possibles même quand les noms ne sont pas parfaitement
 * identiques après normalisation (ex: légères variations résiduelles).
 */
export function similarityScore(a: string, b: string): number {
  const na = normalizeEnseigne(a);
  const nb = normalizeEnseigne(b);
  if (na === nb) return 1;
  // Distance de Jaccard sur les mots
  const wa = new Set(na.split(' '));
  const wb = new Set(nb.split(' '));
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  const union = wa.size + wb.size - inter;
  return union === 0 ? 0 : inter / union;
}
