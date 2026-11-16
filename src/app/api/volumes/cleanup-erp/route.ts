import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * DELETE /api/volumes/cleanup-erp?date=2026-10-31
 * DELETE /api/volumes/cleanup-erp?month=2026-10
 *
 * Supprime les lignes VolumeSale importées par erreur (ex: mauvais mapping
 * de colonne lors d'un premier import ERP où la colonne 'Colis' (format)
 * a été utilisée comme quantité).
 *
 * Critères de suppression (combinaison AND):
 *   - date exacte OU (year + month)
 *   - productLabel contient 'X2 BQ' OU 'X1 PAV' OU 'ETUI X9' (patterns ERP)
 *
 * ça évite de supprimer les volumes légitimes d'autres sources qui pourraient
 * partager la même date mais avoir des libellés produits différents.
 *
 * Body response:
 *   { ok: true, deleted: <count>, criteria: { date, year, month } }
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dateStr = searchParams.get('date'); // YYYY-MM-DD
    const monthParam = searchParams.get('month'); // YYYY-MM
    const productPattern = searchParams.get('productPattern'); // optional override

    if (!dateStr && !monthParam) {
      return NextResponse.json(
        { ok: false, error: 'Paramètre requis: date=YYYY-MM-DD ou month=YYYY-MM' },
        { status: 400 }
      );
    }

    // Construit le where
    const where: Record<string, unknown> = {};

    if (dateStr) {
      const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) {
        return NextResponse.json(
          { ok: false, error: 'Format date invalide. Attendu: YYYY-MM-DD' },
          { status: 400 }
        );
      }
      const d = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
      where.date = d;
    } else if (monthParam) {
      const m = monthParam.match(/^(\d{4})-(\d{2})$/);
      if (!m) {
        return NextResponse.json(
          { ok: false, error: 'Format month invalide. Attendu: YYYY-MM' },
          { status: 400 }
        );
      }
      where.year = parseInt(m[1], 10);
      where.month = parseInt(m[2], 10);
    }

    // Filtre sur les patterns ERP pour ne supprimer QUE les lignes ERP
    // (et préserver les autres imports légitimes de la même période)
    const patterns = productPattern
      ? [productPattern.toUpperCase()]
      : ['X2 BQ', 'X1 PAV', 'ETUI X9'];
    where.productLabel = { contains: patterns[0] };
    // Note: Prisma ne supporte pas OR direct sur contains en mode simple,
    // on va donc récupérer puis supprimer en deux passes si plusieurs patterns.

    // Compte d'abord
    const allRows = await db.volumeSale.findMany({
      where,
      select: { id: true, productLabel: true },
    });

    // Filtre manuellement sur tous les patterns (OR)
    const idsToDelete = allRows
      .filter((r) => patterns.some((p) => r.productLabel.toUpperCase().includes(p)))
      .map((r) => r.id);

    if (idsToDelete.length === 0) {
      return NextResponse.json({
        ok: true,
        deleted: 0,
        message: 'Aucune ligne ne correspond aux critères (date + pattern ERP)',
        criteria: { date: dateStr, month: monthParam, patterns },
      });
    }

    // Suppression par lots
    const BATCH = 500;
    let deleted = 0;
    for (let i = 0; i < idsToDelete.length; i += BATCH) {
      const batch = idsToDelete.slice(i, i + BATCH);
      const result = await db.volumeSale.deleteMany({
        where: { id: { in: batch } },
      });
      deleted += result.count;
    }

    console.log(`[volumes/cleanup-erp] Deleted ${deleted} rows matching date=${dateStr || monthParam} patterns=${patterns.join(',')}`);

    return NextResponse.json({
      ok: true,
      deleted,
      criteria: { date: dateStr, month: monthParam, patterns },
    });
  } catch (e) {
    console.error('[volumes/cleanup-erp] Error:', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur serveur' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    usage: 'DELETE /api/volumes/cleanup-erp?date=YYYY-MM-DD ou ?month=YYYY-MM',
    description: 'Supprime les lignes VolumeSale ERP (productLabel contient X2 BQ / X1 PAV / ETUI X9) pour une date ou un mois donné. Utilisé pour nettoyer un import raté.',
  });
}
