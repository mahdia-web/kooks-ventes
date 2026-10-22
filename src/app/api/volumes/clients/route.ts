import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/volumes/clients
 * Retourne TOUS les noms de clients distincts présents dans la table VolumeSale,
 * dédupliqués par clé normalisée (accents + espaces + apostrophes).
 *
 * Chaque entrée contient:
 *   - canonical: nom à afficher (le plus court parmi les variants — souvent le
 *     plus "propre", sans accent superflu ni espaces multiples)
 *   - variants: liste des noms exacts tels qu'ils apparaissent en base
 *
 * Quand l'utilisateur sélectionne un client, le front envoie les variants
 * (séparés par '|') à /api/volumes/stats qui filtre sur tous les variants.
 */
export async function GET() {
  try {
    const result = await db.volumeSale.findMany({
      select: { enseigne: true },
      distinct: ['enseigne'],
    });

    // Normalisation pour la déduplication
    // On ne fusionne QUE les noms qui diffèrent par:
    //   - les accents (é = e)
    //   - les apostrophes (O'TERA = OTERA)
    //   - les espaces multiples / leading / trailing
    // On NE fusionne PAS les noms qui diffèrent par des mots complets (ex:
    // "AUCHAN LYON" vs "AUCHAN BOULOGNE" restent distincts — ce sont 2 magasins).
    const normalizeForDedup = (s: string): string =>
      s
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // supprime les accents
        .replace(/[''`]/g, '')           // supprime apostrophes typographiques
        .replace(/\s+/g, ' ')            // collapse les espaces
        .trim();

    // Groupe par clé normalisée
    const groups = new Map<string, string[]>();
    for (const r of result) {
      const name = r.enseigne;
      if (!name || !name.trim()) continue; // ignore les noms vides
      const key = normalizeForDedup(name);
      if (!groups.has(key)) groups.set(key, []);
      const arr = groups.get(key)!;
      if (!arr.includes(name)) arr.push(name);
    }

    // Construit la réponse : nom canonique (le plus court, alphabétique sinon) + variants
    const data = Array.from(groups.values())
      .map((variants) => {
        // Trie par longueur croissante, puis alphabétique — le plus court est
        // souvent le plus "propre" (ex: "AUCHAN LYON" plutôt que "AUCHAN HYPERMARCHE LYON")
        const sorted = [...variants].sort(
          (a, b) => a.length - b.length || a.localeCompare(b)
        );
        return {
          canonical: sorted[0],
          variants: sorted,
        };
      })
      .sort((a, b) => a.canonical.localeCompare(b.canonical));

    return NextResponse.json({
      ok: true,
      data,
      stats: {
        totalRaw: result.length,
        deduplicated: data.length,
        duplicatesMerged: result.length - data.length,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    );
  }
}
