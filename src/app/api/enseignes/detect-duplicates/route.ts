import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { normalizeEnseigne, similarityScore } from '@/lib/normalize-enseigne';

/**
 * GET /api/enseignes/detect-duplicates
 *
 * Retourne les groupes d'enseignes qui sont des doublons (mêmes magasins
 * avec des écritures différentes).
 *
 * Deux types de détection :
 *   1. "exact" : même forme normalisée après normalizeEnseigne()
 *   2. "similar" : similarité Jaccard >= 0.85 (ex: légères variations résiduelles)
 *
 * Filtre : les groupes marqués comme "pas un doublon" (via
 * POST /api/enseignes/dismiss-duplicate) sont exclus de la réponse.
 * Une signature de groupe = IDs triés join "|".
 *
 * Cache désactivé (Cache-Control: no-store) car la réponse change après
 * chaque dismiss/merge — sinon le navigateur retourne une version périmée.
 */
export async function GET() {
  try {
    // Charge les groupes dismissés pour les filtrer
    const dismissedParam = await db.parameter.findUnique({
      where: { key: 'dismissedDuplicateGroups' },
    });
    let dismissedSignatures = new Set<string>();
    if (dismissedParam) {
      try {
        const list = JSON.parse(dismissedParam.value);
        if (Array.isArray(list)) {
          dismissedSignatures = new Set(list.map((e: any) => e.signature));
        }
      } catch {}
    }
    console.log(`[detect-duplicates] dismissed signatures loaded: ${dismissedSignatures.size}`);

    const enseignes = await db.enseigne.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        agent: true,
        isActive: true,
        commissionRate: true,
      },
      orderBy: { name: 'asc' },
    });

    // Récupère le nombre de ventes par enseigne (group by name)
    const salesCountAgg = await db.sale.groupBy({
      by: ['enseigne'],
      _count: { _all: true },
    });
    const salesCountMap = new Map<string, number>(
      salesCountAgg.map((s) => [s.enseigne, s._count._all])
    );

    type EnseigneWithCount = typeof enseignes[number] & { salesCount: number };
    const enriched: EnseigneWithCount[] = enseignes.map((e) => ({
      ...e,
      salesCount: salesCountMap.get(e.name) ?? 0,
    }));

    // === 1. Détection EXACTE par clé normalisée ===
    const exactGroups = new Map<string, EnseigneWithCount[]>();
    for (const e of enriched) {
      const key = normalizeEnseigne(e.name);
      if (!key) continue;
      if (!exactGroups.has(key)) exactGroups.set(key, []);
      exactGroups.get(key)!.push(e);
    }

    // === 2. Détection SIMILAR (Jaccard >= 0.85) entre les éléments non déjà groupés ===
    const inExactGroup = new Set<string>();
    for (const items of exactGroups.values()) {
      if (items.length > 1) {
        for (const i of items) inExactGroup.add(i.id);
      }
    }

    const similarGroups: Array<{
      normalized: string;
      matchType: 'similar';
      score: number;
      items: EnseigneWithCount[];
    }> = [];

    const orphans = enriched.filter((e) => !inExactGroup.has(e.id));
    const matched = new Set<string>();
    for (let i = 0; i < orphans.length; i++) {
      if (matched.has(orphans[i].id)) continue;
      const group: EnseigneWithCount[] = [orphans[i]];
      let bestScore = 1;
      for (let j = i + 1; j < orphans.length; j++) {
        if (matched.has(orphans[j].id)) continue;
        const score = similarityScore(orphans[i].name, orphans[j].name);
        if (score >= 0.85) {
          group.push(orphans[j]);
          matched.add(orphans[j].id);
          if (score < bestScore) bestScore = score;
        }
      }
      if (group.length > 1) {
        matched.add(orphans[i].id);
        similarGroups.push({
          normalized: normalizeEnseigne(orphans[i].name),
          matchType: 'similar',
          score: bestScore,
          items: group.sort((a, b) => a.name.localeCompare(b.name)),
        });
      }
    }

    // Combine les deux types et calcule la signature pour chaque groupe
    const allGroups = [
      ...Array.from(exactGroups.entries())
        .filter(([, items]) => items.length > 1)
        .map(([normalized, items]) => ({
          normalized,
          matchType: 'exact' as const,
          score: 1,
          items: items.sort((a, b) => a.name.localeCompare(b.name)),
        })),
      ...similarGroups,
    ].map((g) => ({
      ...g,
      signature: g.items.map((i) => i.id).sort().join('|'),
    }));

    // Filtre les groupes dismissés
    const duplicates = allGroups
      .filter((g) => !dismissedSignatures.has(g.signature))
      .sort((a, b) => {
        if (b.items.length !== a.items.length) return b.items.length - a.items.length;
        return b.score - a.score;
      });

    console.log(`[detect-duplicates] ${allGroups.length} groups detected, ${duplicates.length} after filter (dismissed ${dismissedSignatures.size})`);

    // Cache-Control: no-store — critical pour que la réponse soit toujours fraîche
    // après un dismiss/merge. Sans ça, le navigateur peut retourner une ancienne version.
    return NextResponse.json({
      ok: true,
      data: duplicates,
      total: duplicates.length,
      totalDuplicates: duplicates.reduce((s, g) => s + g.items.length, 0),
      dismissedCount: dismissedSignatures.size,
      stats: {
        exact: duplicates.filter((g) => g.matchType === 'exact').length,
        similar: duplicates.filter((g) => g.matchType === 'similar').length,
        totalEnseignes: enriched.length,
        dismissed: dismissedSignatures.size,
      },
      // Timestamp pour debug et cache-busting
      generatedAt: new Date().toISOString(),
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (e) {
    console.error('[detect-duplicates] Error:', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
