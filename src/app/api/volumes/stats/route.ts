import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/volumes/stats?year=2026&month=9
 *
 * Retourne les stats de volumes:
 * - topProducts: top produits par quantité
 * - topParfums: top parfums par quantité
 * - topFormats: top formats par quantité
 * - monthlySeries: évolution mensuelle des quantités
 * - totalQuantity: quantité totale pour la période
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const yearParam = searchParams.get('year');
    const monthParam = searchParams.get('month');

    const where: { year?: number; month?: number } = {};
    if (yearParam) where.year = parseInt(yearParam, 10);
    if (monthParam) where.month = parseInt(monthParam, 10);

    // Top produits par quantité
    const allVolumes = await db.volumeSale.findMany({
      where,
      select: { productLabel: true, parfum: true, format: true, quantity: true, enseigne: true, date: true, year: true, month: true },
    });

    // Agréger par produit
    const byProduct = new Map<string, { productLabel: string; parfum: string | null; format: string | null; totalQty: number; }>();
    const byParfum = new Map<string, number>();
    const byFormat = new Map<string, number>();
    const byMonth = new Map<string, { year: number; month: number; totalQty: number; }>();
    const byEnseigne = new Map<string, number>();

    // Calcule le nombre total de pots
    // Pour chaque volume, on multiplie la quantité (colis) par le nombre de pots par colis du format
    const FORMAT_POTS_PER_COLIS: Record<string, number> = {
      'Lot de 2': 12,
      'Indiv Fouro': 8,
      'Indiv PAV 8': 8,
      'Box de 9': 36,
    };
    let totalPots = 0;
    for (const v of allVolumes) {
      const potsPerColis = v.format ? (FORMAT_POTS_PER_COLIS[v.format] ?? 1) : 1;
      totalPots += v.quantity * potsPerColis;
    }

    // Objectif: 3,000,000 pots, année démarrée le 01/10/2026
    const OBJECTIVE = 3000000;
    const YEAR_START = new Date(2026, 9, 1); // October 1, 2026 (month 9 = October, 0-indexed)
    // Pots vendus depuis le 01/10/2026
    let potsSinceOct = 0;
    for (const v of allVolumes) {
      if (v.date >= YEAR_START) {
        const potsPerColis = v.format ? (FORMAT_POTS_PER_COLIS[v.format] ?? 1) : 1;
        potsSinceOct += v.quantity * potsPerColis;
      }
    }
    const remaining = Math.max(0, OBJECTIVE - potsSinceOct);
    const progressPct = (potsSinceOct / OBJECTIVE) * 100;

    let totalQuantity = 0;
    for (const v of allVolumes) {
      totalQuantity += v.quantity;

      // By product
      const key = v.productLabel;
      const p = byProduct.get(key) ?? { productLabel: v.productLabel, parfum: v.parfum, format: v.format, totalQty: 0 };
      p.totalQty += v.quantity;
      byProduct.set(key, p);

      // By parfum
      if (v.parfum) {
        byParfum.set(v.parfum, (byParfum.get(v.parfum) ?? 0) + v.quantity);
      }

      // By format
      if (v.format) {
        byFormat.set(v.format, (byFormat.get(v.format) ?? 0) + v.quantity);
      }

      // By month
      const monthKey = `${v.year}-${v.month}`;
      const m = byMonth.get(monthKey) ?? { year: v.year, month: v.month, totalQty: 0 };
      m.totalQty += v.quantity;
      byMonth.set(monthKey, m);

      // By enseigne
      byEnseigne.set(v.enseigne, (byEnseigne.get(v.enseigne) ?? 0) + v.quantity);
    }

    const topProducts = Array.from(byProduct.values())
      .sort((a, b) => b.totalQty - a.totalQty)
      .slice(0, 20);

    const topParfums = Array.from(byParfum.entries())
      .map(([parfum, qty]) => ({ parfum, totalQty: qty }))
      .sort((a, b) => b.totalQty - a.totalQty);

    const topFormats = Array.from(byFormat.entries())
      .map(([format, qty]) => ({ format, totalQty: qty }))
      .sort((a, b) => b.totalQty - a.totalQty);

    const topEnseignes = Array.from(byEnseigne.entries())
      .map(([enseigne, qty]) => ({ enseigne, totalQty: qty }))
      .sort((a, b) => b.totalQty - a.totalQty)
      .slice(0, 10);

    const monthlySeries = Array.from(byMonth.values())
      .sort((a, b) => (a.year - b.year) || (a.month - b.month))
      .map(m => ({
        ...m,
        label: `${m.month.toString().padStart(2, '0')}/${m.year}`,
      }));

    return NextResponse.json({
      ok: true,
      data: {
        totalQuantity,
        totalPots,
        potsSinceOct,
        objective: OBJECTIVE,
        remaining,
        progressPct,
        topProducts,
        topParfums,
        topFormats,
        topEnseignes,
        monthlySeries,
        totalRecords: allVolumes.length,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    );
  }
}
