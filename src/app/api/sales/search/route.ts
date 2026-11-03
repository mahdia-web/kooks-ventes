import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { normalizeEnseigne, similarityScore } from '@/lib/normalize-enseigne';

/**
 * GET /api/sales/search?q=AUCHAN&limit=50
 *
 * Recherche fuzzy de ventes par nom d'enseigne.
 * Utilisé pour retrouver une vente quand on soupçonne qu'elle a été
 * importée sous un nom légèrement différent (ex: "AUCHAN MANDELIEU"
 * peut avoir été importé comme "AUCHAN - MANDELIEU" ou "AUCHAN MANDALIEU").
 *
 * Stratégie :
 *   1. Match exact (case-insensitive) sur l'enseigne
 *   2. Match par normalisation (normalizeEnseigne identique)
 *   3. Match par similarité (Jaccard >= 0.5 — seuil plus permissif que pour
 *      la détection de doublons car on cherche à TROUVER des ventes)
 *
 * Réponse :
 *   {
 *     ok: true,
 *     results: Array<Sale & { enseigne: string, date, amountHT, ... }>,
 *     matchedEnseignes: Array<{ name: string, salesCount: number, matchMethod: string, score: number }>,
 *     total: number
 *   }
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get('q') ?? '';
    const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);
    const agent = url.searchParams.get('agent'); // optionnel

    if (!q.trim()) {
      return NextResponse.json(
        { ok: false, error: 'Paramètre q requis (terme de recherche)' },
        { status: 400 }
      );
    }

    const query = q.trim();
    const queryLower = query.toLowerCase();
    const queryNorm = normalizeEnseigne(query);

    // 1. Charge toutes les enseignes pour trouver celles qui matchent
    const allEnseignes = await db.enseigne.findMany({
      select: { id: true, name: true, type: true, agent: true, isActive: true },
    });

    // Calcule un score pour chaque enseigne
    type Match = {
      name: string;
      type: string;
      agent: string;
      isActive: boolean;
      score: number;
      method: 'exact' | 'normalized' | 'similar' | 'contains';
    };
    const matches: Match[] = [];
    for (const e of allEnseignes) {
      const eLower = e.name.toLowerCase();
      const eNorm = normalizeEnseigne(e.name);
      let score = 0;
      let method: Match['method'] | null = null;

      // 1. Exact case-insensitive
      if (eLower === queryLower) {
        score = 1;
        method = 'exact';
      }
      // 2. Normalized match
      else if (queryNorm && eNorm === queryNorm) {
        score = 0.95;
        method = 'normalized';
      }
      // 3. Contains (query dans le nom de l'enseigne ou vice versa)
      else if (eLower.includes(queryLower) || queryLower.includes(eLower)) {
        score = 0.7;
        method = 'contains';
      }
      // 4. Similarité Jaccard (seuil permissif 0.5)
      else {
        const sim = similarityScore(query, e.name);
        if (sim >= 0.5) {
          score = sim;
          method = 'similar';
        }
      }

      if (method) {
        matches.push({
          name: e.name,
          type: e.type,
          agent: e.agent,
          isActive: e.isActive,
          score,
          method,
        });
      }
    }

    // Trie par score décroissant
    matches.sort((a, b) => b.score - a.score);

    if (matches.length === 0) {
      return NextResponse.json({
        ok: true,
        results: [],
        matchedEnseignes: [],
        total: 0,
        message: `Aucune enseigne ne correspond à "${query}" (même avec similarité >= 50%). La vente n'a peut-être pas été importée, ou l'enseigne a un nom très différent.`,
      });
    }

    // 2. Récupère les ventes pour les enseignes matchées
    // Limite aux 5 meilleures enseignes pour éviter trop de résultats
    const topMatches = matches.slice(0, 5);
    const matchNames = topMatches.map((m) => m.name);
    const salesCountMap = new Map<string, number>();

    // Compte les ventes par enseigne
    const salesCountAgg = await db.sale.groupBy({
      by: ['enseigne'],
      where: { enseigne: { in: matchNames } },
      _count: { _all: true },
    });
    for (const s of salesCountAgg) {
      salesCountMap.set(s.enseigne, s._count._all);
    }

    // Récupère les ventes réelles (avec filtre agent optionnel)
    const where: any = { enseigne: { in: matchNames } };
    if (agent && agent !== 'all') where.agent = agent;

    const sales = await db.sale.findMany({
      where,
      select: {
        id: true,
        blNumber: true,
        date: true,
        enseigne: true,
        type: true,
        agent: true,
        amountHT: true,
        amountTTC: true,
        rate: true,
        commission: true,
        month: true,
        year: true,
      },
      orderBy: { date: 'desc' },
      take: limit,
    });

    // Construit la réponse
    const matchedEnseignes = topMatches.map((m) => ({
      ...m,
      salesCount: salesCountMap.get(m.name) ?? 0,
    }));

    return NextResponse.json({
      ok: true,
      results: sales,
      matchedEnseignes,
      total: sales.length,
      query,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    );
  }
}
