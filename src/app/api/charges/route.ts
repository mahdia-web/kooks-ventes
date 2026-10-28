import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isChargeDirecte } from '@/lib/compte-comptable';

/**
 * GET /api/charges?category=Transport&startDate=01/01/2026&endDate=31/12/2026&enseigne=XXX&vendor=YYY
 *
 * Renvoie:
 *   - data: toutes les charges filtrées (triées par date desc)
 *   - topVendors: top 15 fournisseurs par total HT
 *   - topCategories: top catégories (avec pct)
 *   - categories: liste distincte (pour dropdown filtre)
 *   - vendors: liste distincte (pour dropdown filtre fournisseur)
 *   - enseignes: liste distincte (pour dropdown filtre client)
 *   - previousPeriod: KPIs période précédente (même durée, juste avant)
 *       → pour calculer la variation (vs période précédente)
 *   - marginPreview: CA total + marge brute sur la même période
 *       (récupéré depuis la table Sale)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const enseigne = searchParams.get('enseigne');
    const vendorParam = searchParams.get('vendor');
    const startDateStr = searchParams.get('startDate');
    const endDateStr = searchParams.get('endDate');

    const where: Record<string, unknown> = {};
    if (category && category !== 'all') where.category = category;
    if (enseigne && enseigne !== 'all') {
      const names = enseigne.split('|').filter(Boolean);
      if (names.length === 1) where.enseigne = names[0];
      else where.enseigne = { in: names };
    }
    if (vendorParam && vendorParam !== 'all') {
      where.vendor = { contains: vendorParam };
    }

    let currentStart: Date | null = null;
    let currentEnd: Date | null = null;
    let prevStart: Date | null = null;
    let prevEnd: Date | null = null;

    if (startDateStr && endDateStr) {
      const m1 = startDateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      const m2 = endDateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (m1 && m2) {
        currentStart = new Date(parseInt(m1[3]), parseInt(m1[2]) - 1, parseInt(m1[1]));
        currentEnd = new Date(parseInt(m2[3]), parseInt(m2[2]) - 1, parseInt(m2[1]));
        currentEnd.setHours(23, 59, 59);
        where.date = { gte: currentStart, lte: currentEnd };

        // Période précédente = même durée juste avant
        const durationMs = currentEnd.getTime() - currentStart.getTime();
        prevEnd = new Date(currentStart.getTime() - 1); // la veille du début
        prevStart = new Date(prevEnd.getTime() - durationMs);
      }
    }

    const charges = await db.charge.findMany({
      where,
      orderBy: { date: 'desc' },
    });

    // Top 15 fournisseurs (par total HT) — basé sur les charges filtrées
    const vendorMap = new Map<string, { totalHT: number; count: number; category: string; amountTTC: number; }>();
    for (const c of charges) {
      const name = (c.vendor ?? '').trim() || '(sans fournisseur)';
      const cur = vendorMap.get(name) ?? { totalHT: 0, count: 0, category: c.category, amountTTC: 0 };
      cur.totalHT += c.amountHT;
      cur.amountTTC += c.amountTTC;
      cur.count += 1;
      vendorMap.set(name, cur);
    }
    const totalHTAll = charges.reduce((s, c) => s + c.amountHT, 0);
    const totalTTCAll = charges.reduce((s, c) => s + c.amountTTC, 0);
    const topVendors = Array.from(vendorMap.entries())
      .map(([vendor, d]) => ({
        vendor,
        totalHT: d.totalHT,
        totalTTC: d.amountTTC,
        count: d.count,
        category: d.category,
        pct: totalHTAll > 0 ? (d.totalHT / totalHTAll) * 100 : 0,
      }))
      .sort((a, b) => b.totalHT - a.totalHT)
      .slice(0, 15);

    // Top catégories (avec pct et count) — déjà groupé par label lisible
    const categoryMap = new Map<string, { total: number; count: number }>();
    for (const c of charges) {
      const cur = categoryMap.get(c.category) ?? { total: 0, count: 0 };
      cur.total += c.amountHT;
      cur.count += 1;
      categoryMap.set(c.category, cur);
    }
    const topCategories = Array.from(categoryMap.entries())
      .map(([category, d]) => ({
        category,
        total: d.total,
        count: d.count,
        pct: totalHTAll > 0 ? (d.total / totalHTAll) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);

    // Période précédente: KPIs pour calcul variation
    let previousPeriod: {
      totalHT: number;
      totalTTC: number;
      nbCharges: number;
      directHT: number;
      variationHT: number;
      variationPct: number;
      variationTTC: number;
      variationNb: number;
    } | null = null;

    if (prevStart && prevEnd) {
      const prevCharges = await db.charge.findMany({
        where: { date: { gte: prevStart, lte: prevEnd } },
        select: { amountHT: true, amountTTC: true, allocationMethod: true },
      });
      const prevTotalHT = prevCharges.reduce((s, c) => s + c.amountHT, 0);
      const prevTotalTTC = prevCharges.reduce((s, c) => s + c.amountTTC, 0);
      const prevDirect = prevCharges
        .filter((c) => c.allocationMethod === 'DIRECT')
        .reduce((s, c) => s + c.amountHT, 0);
      previousPeriod = {
        totalHT: prevTotalHT,
        totalTTC: prevTotalTTC,
        nbCharges: prevCharges.length,
        directHT: prevDirect,
        variationHT: totalHTAll - prevTotalHT,
        variationPct: prevTotalHT > 0 ? ((totalHTAll - prevTotalHT) / prevTotalHT) * 100 : 0,
        variationTTC: totalTTCAll - prevTotalTTC,
        variationNb: charges.length - prevCharges.length,
      };
    }

    // Aperçu marge: CA + charges + marge sur la période
    let marginPreview: {
      caHT: number;
      chargesHT: number;
      margeBrute: number;
      margePct: number;
      nbVentes: number;
    } | null = null;

    if (currentStart && currentEnd) {
      const sales = await db.sale.findMany({
        where: { date: { gte: currentStart, lte: currentEnd } },
        select: { amountHT: true },
      });
      const caHT = sales.reduce((s, s2) => s + s2.amountHT, 0);
      marginPreview = {
        caHT,
        chargesHT: totalHTAll,
        margeBrute: caHT - totalHTAll,
        margePct: caHT > 0 ? ((caHT - totalHTAll) / caHT) * 100 : 0,
        nbVentes: sales.length,
      };
    }

    // Série mensuelle: charges par mois (sur la période filtrée)
    const monthlyMap = new Map<string, { year: number; month: number; totalHT: number; count: number }>();
    for (const c of charges) {
      const key = `${c.year}-${c.month}`;
      const m = monthlyMap.get(key) ?? { year: c.year, month: c.month, totalHT: 0, count: 0 };
      m.totalHT += c.amountHT;
      m.count += 1;
      monthlyMap.set(key, m);
    }
    const monthlySeries = Array.from(monthlyMap.values())
      .sort((a, b) => (a.year - b.year) || (a.month - b.month))
      .map(m => ({
        ...m,
        label: `${String(m.month).padStart(2, '0')}/${m.year}`,
      }));

    // Catégories / Fournisseurs / Enseignes distinctes (pour dropdowns)
    const [allCategories, allVendors, allEnseignes] = await Promise.all([
      db.charge.findMany({ select: { category: true }, distinct: ['category'], orderBy: { category: 'asc' } }),
      db.charge.findMany({
        select: { vendor: true },
        distinct: ['vendor'],
        where: { vendor: { not: null } },
        orderBy: { vendor: 'asc' },
      }),
      db.charge.findMany({
        select: { enseigne: true },
        distinct: ['enseigne'],
        where: { enseigne: { not: null } },
        orderBy: { enseigne: 'asc' },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      data: charges,
      topVendors,
      topCategories,
      monthlySeries,
      categories: allCategories.map((c) => c.category),
      vendors: allVendors.map((v) => v.vendor).filter(Boolean),
      enseignes: allEnseignes.map((e) => e.enseigne).filter(Boolean),
      previousPeriod,
      marginPreview,
      period: currentStart && currentEnd
        ? { start: currentStart.toISOString().split('T')[0], end: currentEnd.toISOString().split('T')[0] }
        : null,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/charges — crée une charge manuellement
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { date, category, subLabel, vendor, amountHT, amountTTC, enseigne, allocationMethod } = body;

    if (!date || !category || amountHT == null) {
      return NextResponse.json(
        { ok: false, error: 'Champs requis: date, category, amountHT' },
        { status: 400 }
      );
    }

    const d = new Date(date);
    if (isNaN(d.getTime())) {
      return NextResponse.json({ ok: false, error: 'Date invalide' }, { status: 400 });
    }

    const finalHT = parseFloat(amountHT);
    const finalTTC = amountTTC ? parseFloat(amountTTC) : finalHT;

    const deduplicationKey = `MANUAL|${d.toISOString().split('T')[0]}|${category}|${finalHT.toFixed(2)}|${subLabel ?? ''}|${vendor ?? ''}`;

    const charge = await db.charge.create({
      data: {
        date: d,
        month: d.getMonth() + 1,
        year: d.getFullYear(),
        category,
        subLabel: subLabel ?? null,
        vendor: vendor ?? null,
        amountHT: finalHT,
        amountTTC: finalTTC,
        enseigne: enseigne || null,
        allocationMethod: allocationMethod || ((enseigne || isChargeDirecte(category)) ? 'DIRECT' : 'GLOBAL'),
        source: 'MANUAL',
        deduplicationKey,
      },
    });

    return NextResponse.json({ ok: true, data: charge });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/charges?id=XXX — supprime une charge
 * (utilise query string car le body n'est pas standard pour DELETE)
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ ok: false, error: 'ID requis' }, { status: 400 });
    }
    await db.charge.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    );
  }
}
