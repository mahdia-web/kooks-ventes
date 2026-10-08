import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/volumes/stats?enseigne=XXX&year=2026&month=9
 * Retourne les stats de volumes avec filtre optionnel par enseigne.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const enseigne = searchParams.get('enseigne');
    const yearParam = searchParams.get('year');
    const monthParam = searchParams.get('month');

    const where: Record<string, unknown> = {};
    if (enseigne) where.enseigne = enseigne;
    if (yearParam) where.year = parseInt(yearParam, 10);
    if (monthParam) where.month = parseInt(monthParam, 10);

    const allVolumes = await db.volumeSale.findMany({
      where,
      select: { productLabel: true, parfum: true, format: true, quantity: true, enseigne: true, date: true, year: true, month: true, unitPrice: true },
      orderBy: { date: 'asc' },
    });

    const FORMAT_POTS: Record<string, number> = { 'Lot de 2': 12, 'Indiv Fouro': 8, 'Indiv PAV 8': 8, 'Box de 9': 36 };

    let minDate: Date | null = null;
    let maxDate: Date | null = null;
    for (const v of allVolumes) {
      if (!minDate || v.date < minDate) minDate = v.date;
      if (!maxDate || v.date > maxDate) maxDate = v.date;
    }

    const byProduct = new Map<string, { productLabel: string; parfum: string | null; format: string | null; totalQty: number; }>();
    const byParfum = new Map<string, number>();
    const byFormat = new Map<string, { colis: number; pots: number; }>();
    const byMonth = new Map<string, { year: number; month: number; totalQty: number; totalPots: number; }>();
    const byEnseigne = new Map<string, { colis: number; pots: number; }>();

    let totalQuantity = 0;
    let totalPots = 0;

    for (const v of allVolumes) {
      totalQuantity += v.quantity;
      const potsPerColis = v.format ? (FORMAT_POTS[v.format] ?? 1) : 1;
      const pots = v.quantity * potsPerColis;
      totalPots += pots;

      const key = v.productLabel;
      const p = byProduct.get(key) ?? { productLabel: v.productLabel, parfum: v.parfum, format: v.format, totalQty: 0 };
      p.totalQty += v.quantity;
      byProduct.set(key, p);

      if (v.parfum) byParfum.set(v.parfum, (byParfum.get(v.parfum) ?? 0) + v.quantity);

      if (v.format) {
        const f = byFormat.get(v.format) ?? { colis: 0, pots: 0 };
        f.colis += v.quantity;
        f.pots += pots;
        byFormat.set(v.format, f);
      }

      const monthKey = `${v.year}-${v.month}`;
      const m = byMonth.get(monthKey) ?? { year: v.year, month: v.month, totalQty: 0, totalPots: 0 };
      m.totalQty += v.quantity;
      m.totalPots += pots;
      byMonth.set(monthKey, m);

      const e = byEnseigne.get(v.enseigne) ?? { colis: 0, pots: 0 };
      e.colis += v.quantity;
      e.pots += pots;
      byEnseigne.set(v.enseigne, e);
    }

    const OBJECTIVE = 3000000;
    const YEAR_START = new Date(2026, 9, 1);
    let potsSinceOct = 0;
    for (const v of allVolumes) {
      if (v.date >= YEAR_START) {
        const potsPerColis = v.format ? (FORMAT_POTS[v.format] ?? 1) : 1;
        potsSinceOct += v.quantity * potsPerColis;
      }
    }

    const topProducts = Array.from(byProduct.values()).sort((a, b) => b.totalQty - a.totalQty).slice(0, 20);
    const topParfums = Array.from(byParfum.entries()).map(([parfum, qty]) => ({ parfum, totalQty: qty })).sort((a, b) => b.totalQty - a.totalQty);
    const topFormats = Array.from(byFormat.entries()).map(([format, d]) => ({ format, totalQty: d.colis, totalPots: d.pots })).sort((a, b) => b.totalQty - a.totalQty);
    const topEnseignes = Array.from(byEnseigne.entries()).map(([enseigne, d]) => ({ enseigne, totalQty: d.colis, totalPots: d.pots })).sort((a, b) => b.totalQty - a.totalQty).slice(0, 20);
    const monthlySeries = Array.from(byMonth.values()).sort((a, b) => (a.year - b.year) || (a.month - b.month)).map(m => ({ ...m, label: `${m.month.toString().padStart(2, '0')}/${m.year}` }));

    return NextResponse.json({
      ok: true,
      data: {
        totalQuantity,
        totalPots,
        potsSinceOct,
        objective: OBJECTIVE,
        remaining: Math.max(0, OBJECTIVE - potsSinceOct),
        progressPct: (potsSinceOct / OBJECTIVE) * 100,
        dateRange: {
          start: minDate ? minDate.toISOString().split('T')[0] : null,
          end: maxDate ? maxDate.toISOString().split('T')[0] : null,
        },
        topProducts,
        topParfums,
        topFormats,
        topEnseignes,
        monthlySeries,
        totalRecords: allVolumes.length,
        filteredEnseigne: enseigne || null,
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 });
  }
}
