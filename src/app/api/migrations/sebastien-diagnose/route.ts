import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/migrations/sebastien-diagnose
 *
 * Diagnostic : liste TOUTES les ventes avec agent contenant "SEBASTIEN" ou "GASNIER"
 * pour identifier d'éventuels doublons (même vente enregistrée sous deux clés différentes).
 *
 * Response:
 *   {
 *     ok: true,
 *     sales: Array<{ id, blNumber, date, enseigne, agent, amountHT, amountTTC, commission, deduplicationKey, month, year }>,
 *     summary: {
 *       totalSales: number,
 *       totalCA: number,
 *       totalCommission: number,
 *       byBL: Array<{ bl, count, totalCA, dates, enseignes }>,  // groupes par BL
 *       duplicates: Array<{ bl, sales: [...] }>,  // BLs avec 2+ ventes (doublons)
 *     }
 *   }
 *
 * POST /api/migrations/sebastien-diagnose
 * Action : supprime les doublons (garde 1 vente par BL — la plus récente).
 * Garde aussi les ventes sans BL (ne les touche pas).
 */
export async function GET() {
  try {
    // Cherche toutes les ventes avec agent contenant SEBASTIEN ou GASNIER
    const sales = await db.sale.findMany({
      where: {
        OR: [
          { agent: { contains: 'SEBASTIEN', mode: 'insensitive' } },
          { agent: { contains: 'GASNIER', mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        blNumber: true,
        date: true,
        enseigne: true,
        agent: true,
        amountHT: true,
        amountTTC: true,
        commission: true,
        deduplicationKey: true,
        month: true,
        year: true,
      },
      orderBy: { date: 'desc' },
    });

    // Groupe par BL pour identifier les doublons
    const byBL = new Map<string, typeof sales>();
    for (const s of sales) {
      const bl = s.blNumber ?? '(aucun BL)';
      if (!byBL.has(bl)) byBL.set(bl, []);
      byBL.get(bl)!.push(s);
    }

    // Identifie les doublons (BL avec 2+ ventes)
    const duplicates = Array.from(byBL.entries())
      .filter(([bl, items]) => bl !== '(aucun BL)' && items.length > 1)
      .map(([bl, items]) => ({ bl, sales: items }));

    const totalCA = sales.reduce((s, v) => s + v.amountHT, 0);
    const totalCommission = sales.reduce((s, v) => s + v.commission, 0);

    return NextResponse.json({
      ok: true,
      sales,
      summary: {
        totalSales: sales.length,
        totalCA,
        totalCommission,
        byBL: Array.from(byBL.entries()).map(([bl, items]) => ({
          bl,
          count: items.length,
          totalCA: items.reduce((s, v) => s + v.amountHT, 0),
          dates: items.map((i) => i.date.toISOString().split('T')[0]),
          enseignes: items.map((i) => i.enseigne),
          agents: items.map((i) => i.agent),
        })),
        duplicatesCount: duplicates.length,
        duplicates,
      },
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    console.error('[sebastien-diagnose] GET error:', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

/**
 * POST : nettoie les doublons.
 * Pour chaque BL qui a 2+ ventes, garde uniquement la plus récente
 * (ou la première si dates égales) et supprime les autres.
 * Les ventes sans BL ne sont pas touchées.
 */
export async function POST() {
  try {
    const sales = await db.sale.findMany({
      where: {
        OR: [
          { agent: { contains: 'SEBASTIEN', mode: 'insensitive' } },
          { agent: { contains: 'GASNIER', mode: 'insensitive' } },
        ],
        blNumber: { not: null },
      },
      select: {
        id: true,
        blNumber: true,
        date: true,
        enseigne: true,
        agent: true,
        amountHT: true,
        deduplicationKey: true,
      },
      orderBy: { date: 'desc' },
    });

    // Groupe par BL
    const byBL = new Map<string, typeof sales>();
    for (const s of sales) {
      const bl = s.blNumber!;
      if (!byBL.has(bl)) byBL.set(bl, []);
      byBL.get(bl)!.push(s);
    }

    // Pour chaque BL avec 2+ ventes, garde la 1ère (la plus récente car orderBy desc)
    // et collecte les IDs à supprimer
    const idsToDelete: string[] = [];
    const cleanedGroups: Array<{ bl, kept: any, deleted: any[] }> = [];

    for (const [bl, items] of byBL.entries()) {
      if (items.length > 1) {
        const kept = items[0];
        const deleted = items.slice(1);
        idsToDelete.push(...deleted.map((d) => d.id));
        cleanedGroups.push({ bl, kept, deleted });
      }
    }

    if (idsToDelete.length === 0) {
      return NextResponse.json({
        ok: true,
        message: 'Aucun doublon trouvé — la base est propre.',
        deletedCount: 0,
      }, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    // Supprime les doublons en transaction
    const deleteResult = await db.$transaction(async (tx) => {
      const result = await tx.sale.deleteMany({
        where: { id: { in: idsToDelete } },
      });
      return result;
    });

    return NextResponse.json({
      ok: true,
      message: `${deleteResult.count} doublon(s) supprimé(s)`,
      deletedCount: deleteResult.count,
      cleanedGroups: cleanedGroups.map((g) => ({
        bl: g.bl,
        kept: { id: g.kept.id, enseigne: g.kept.enseigne, amountHT: g.kept.amountHT, agent: g.kept.agent },
        deleted: g.deleted.map((d) => ({
          id: d.id,
          enseigne: d.enseigne,
          amountHT: d.amountHT,
          agent: d.agent,
          deduplicationKey: d.deduplicationKey,
        })),
      })),
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    console.error('[sebastien-diagnose] POST error:', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
