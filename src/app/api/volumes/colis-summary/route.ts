import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/volumes/colis-summary?year=2026&month=10
 *
 * Retourne le total des colis par enseigne pour un mois donné.
 * Utilisé par le bilan PDF et le message summary pour afficher
 * le nombre de colis vendus (notamment pour les centrales).
 *
 * Response:
 *   {
 *     ok: true,
 *     data: Array<{ enseigne, totalColis, totalPieces, nbLines }>,
 *     grandTotal: { colis, pieces, nbLines }
 *   }
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get('year') ?? '0', 10);
    const month = parseInt(searchParams.get('month') ?? '0', 10);

    if (!year || !month) {
      return NextResponse.json(
        { ok: false, error: 'year et month requis' },
        { status: 400 }
      );
    }

    // Récupère tous les volumes du mois, groupés par enseigne
    const volumes = await db.volumeSale.findMany({
      where: { year, month },
      select: { enseigne: true, quantity: true, productLabel: true },
    });

    // Groupe par enseigne
    const byEnseigne = new Map<string, { totalColis: number; totalPieces: number; nbLines: number }>();
    for (const v of volumes) {
      const entry = byEnseigne.get(v.enseigne) ?? { totalColis: 0, totalPieces: 0, nbLines: 0 };
      entry.totalColis += v.quantity;
      entry.nbLines += 1;
      byEnseigne.set(v.enseigne, entry);
    }

    // Convertit en array trié par colis décroissant
    const data = Array.from(byEnseigne.entries())
      .map(([enseigne, v]) => ({ enseigne, ...v }))
      .sort((a, b) => b.totalColis - a.totalColis);

    const grandTotal = {
      colis: data.reduce((s, d) => s + d.totalColis, 0),
      pieces: data.reduce((s, d) => s + d.totalPieces, 0),
      nbLines: data.reduce((s, d) => s + d.nbLines, 0),
    };

    return NextResponse.json({
      ok: true,
      data,
      grandTotal,
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    console.error('[colis-summary] Error:', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
