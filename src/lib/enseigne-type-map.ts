import { db } from '@/lib/db';
import { normalizeEnseigne } from '@/lib/normalize-enseigne';

/**
 * Charge la table Enseigne et construit une map `nom_enseigne → type`
 * (type = 'Direct' | 'Centrale' | 'CHR' | …).
 *
 * On essaie d'abord le match exact (case-insensitive), puis un match via
 * `normalizeEnseigne` pour couvrir les variantes orthographiques d'un même
 * magasin.
 *
 * Objectif : à l'agrégation des ventes, NE PLUS faire confiance à `Sale.type`
 * (qui peut être resté à 'Direct' pour des ventes anciennes, alors que
 * l'enseigne a été reclassée à 'Centrale' depuis). On lit le type courant
 * de l'enseigne — c'est la source de vérité corrigée à la main.
 *
 * Utilisation :
 *   const typeMap = await loadEnseigneTypeMap();
 *   const type = typeMap.get(sale.enseigne) ?? sale.type;  // fallback sale.type
 */
export async function loadEnseigneTypeMap(): Promise<Map<string, string>> {
  const enseignes = await db.enseigne.findMany({
    select: { name: true, type: true },
  });
  const map = new Map<string, string>();

  // Index normalisé → type (pour fallback)
  const normalizedIndex = new Map<string, string>();

  for (const e of enseignes) {
    if (!e.type) continue;
    // Match exact (case-insensitive)
    const keyExact = e.name.toLowerCase().trim();
    if (keyExact && !map.has(keyExact)) {
      map.set(keyExact, e.type);
    }
    // Match normalisé
    const keyNorm = normalizeEnseigne(e.name);
    if (keyNorm && !normalizedIndex.has(keyNorm)) {
      normalizedIndex.set(keyNorm, e.type);
    }
  }

  // On retourne une Map qui sait aussi résoudre par normalisation :
  // pour cela on stocke le normalizedIndex via une closure.
  const result = new Map<string, string>();
  for (const [k, v] of map) result.set(k, v);
  // On ajoute aussi les clés normalisées (au cas où sale.enseigne est déjà normalisé)
  for (const [k, v] of normalizedIndex) result.set(k, v);

  // On attache l'index normalisé pour résolution fallback
  (result as Map<string, string> & { __normalized?: Map<string, string> }).__normalized = normalizedIndex;
  return result;
}

/**
 * Récupère le type d'une enseigne depuis la map (exact OU normalisé).
 * Retourne undefined si non trouvé.
 */
export function getTypeFromMap(
  typeMap: Map<string, string>,
  enseigne: string
): string | undefined {
  if (!enseigne) return undefined;
  const exact = typeMap.get(enseigne.toLowerCase().trim());
  if (exact) return exact;
  const normalizedIndex = (typeMap as Map<string, string> & { __normalized?: Map<string, string> }).__normalized;
  if (normalizedIndex) {
    const norm = normalizeEnseigne(enseigne);
    if (norm) return normalizedIndex.get(norm);
  }
  return undefined;
}
