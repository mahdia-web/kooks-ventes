import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/audit
 *
 * Audit complet du CA — pour diagnostiquer une perte de CA.
 *
 * Retourne :
 *   - CA total (toutes ventes confondues)
 *   - CA par année
 *   - CA par mois (12 derniers mois)
 *   - CA par agent
 *   - CA par type (Direct/Centrale/CHR)
 *   - Nombre total de ventes
 *   - Ventes avec BL 26000623, 26000435, 26000381 (les BL de SEBASTIEN)
 *   - Ventes avec agent contenant SEBASTIEN ou GASNIER
 *
 * Permet de comparer avec le CA attendu (ex: 170 250,64€) et d'identifier
 * où le CA a disparu.
 */
export async function GET() {
  try {
    // 1. CA total + nombre de ventes
    const totalAgg = await db.sale.aggregate({
      _sum: { amountHT: true, commission: true },
      _count: { _all: true },
    });

    // 2. CA par année
    const byYear = await db.sale.groupBy({
      by: ['year'],
      _sum: { amountHT: true },
      _count: { _all: true },
      orderBy: { year: 'desc' },
    });

    // 3. CA par mois (12 derniers mois)
    const byMonth = await db.sale.groupBy({
      by: ['year', 'month'],
      _sum: { amountHT: true, commission: true },
      _count: { _all: true },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      take: 12,
    });

    // 4. CA par agent
    const byAgent = await db.sale.groupBy({
      by: ['agent'],
      _sum: { amountHT: true, commission: true },
      _count: { _all: true },
      orderBy: { _sum: { amountHT: 'desc' } },
    });

    // 5. CA par type
    const byType = await db.sale.groupBy({
      by: ['type'],
      _sum: { amountHT: true, commission: true },
      _count: { _all: true },
    });

    // 6. Ventes avec BL de SEBASTIEN (pour vérifier si elles existent encore)
    const sebastienBLs = ['26000623', '26000435', '26000381'];
    const sebastienBLSales = await db.sale.findMany({
      where: { blNumber: { in: sebastienBLs } },
      select: {
        id: true, blNumber: true, date: true, enseigne: true,
        type: true, agent: true, amountHT: true, commission: true,
        month: true, year: true,
      },
      orderBy: { date: 'desc' },
    });

    // 7. Ventes avec agent contenant SEBASTIEN ou GASNIER
    const sebastienAgentSales = await db.sale.findMany({
      where: {
        OR: [
          { agent: { contains: 'SEBASTIEN', mode: 'insensitive' } },
          { agent: { contains: 'GASNIER', mode: 'insensitive' } },
        ],
      },
      select: {
        id: true, blNumber: true, date: true, enseigne: true,
        type: true, agent: true, amountHT: true, commission: true,
        month: true, year: true,
      },
      orderBy: { date: 'desc' },
    });

    // 8. Période couverte par les données
    const dateRange = await db.sale.aggregate({
      _min: { date: true },
      _max: { date: true },
    });

    // 9. CA par type et par agent (croisé)
    const byTypeAgent = await db.sale.groupBy({
      by: ['type', 'agent'],
      _sum: { amountHT: true },
      _count: { _all: true },
      orderBy: { _sum: { amountHT: 'desc' } },
    });

    const totalCA = totalAgg._sum.amountHT ?? 0;
    const expectedCA = 170250.64;
    const diff = totalCA - expectedCA;

    return NextResponse.json({
      ok: true,
      summary: {
        totalCA,
        totalCommission: totalAgg._sum.commission ?? 0,
        totalSales: totalAgg._count._all,
        expectedCA,
        difference: diff,
        differencePercent: expectedCA > 0 ? (diff / expectedCA) * 100 : 0,
        status: Math.abs(diff) < 1 ? 'OK' : diff < 0 ? 'CA MANQUANT' : 'CA EXCÉDENTAIRE',
      },
      dateRange: {
        start: dateRange._min.date ? dateRange._min.date.toISOString().split('T')[0] : null,
        end: dateRange._max.date ? dateRange._max.date.toISOString().split('T')[0] : null,
      },
      byYear: byYear.map((y) => ({
        year: y.year,
        caHT: y._sum.amountHT ?? 0,
        nbSales: y._count._all,
      })),
      byMonth: byMonth.map((m) => ({
        year: m.year,
        month: m.month,
        caHT: m._sum.amountHT ?? 0,
        commission: m._sum.commission ?? 0,
        nbSales: m._count._all,
      })),
      byAgent: byAgent.map((a) => ({
        agent: a.agent,
        caHT: a._sum.amountHT ?? 0,
        commission: a._sum.commission ?? 0,
        nbSales: a._count._all,
      })),
      byType: byType.map((t) => ({
        type: t.type,
        caHT: t._sum.amountHT ?? 0,
        commission: t._sum.commission ?? 0,
        nbSales: t._count._all,
      })),
      byTypeAgent: byTypeAgent.map((ta) => ({
        type: ta.type,
        agent: ta.agent,
        caHT: ta._sum.amountHT ?? 0,
        nbSales: ta._count._all,
      })),
      sebastienBLSales: sebastienBLSales.map((s) => ({
        ...s,
        date: s.date.toISOString().split('T')[0],
      })),
      sebastienAgentSales: sebastienAgentSales.map((s) => ({
        ...s,
        date: s.date.toISOString().split('T')[0],
      })),
      sebastienBLSalesCount: sebastienBLSales.length,
      sebastienAgentSalesCount: sebastienAgentSales.length,
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    console.error('[audit] Error:', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
