import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/charges?category=Transport&startDate=01/01/2026&endDate=31/12/2026&enseigne=XXX
 * Liste toutes les charges avec filtres optionnels.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const enseigne = searchParams.get('enseigne');
    const startDateStr = searchParams.get('startDate');
    const endDateStr = searchParams.get('endDate');

    const where: Record<string, unknown> = {};
    if (category && category !== 'all') where.category = category;
    if (enseigne && enseigne !== 'all') {
      // Supporte les noms séparés par '|' (combinaison de variants)
      const names = enseigne.split('|').filter(Boolean);
      if (names.length === 1) where.enseigne = names[0];
      else where.enseigne = { in: names };
    }

    if (startDateStr && endDateStr) {
      const m1 = startDateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      const m2 = endDateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (m1 && m2) {
        const start = new Date(parseInt(m1[3]), parseInt(m1[2]) - 1, parseInt(m1[1]));
        const end = new Date(parseInt(m2[3]), parseInt(m2[2]) - 1, parseInt(m2[1]));
        end.setHours(23, 59, 59);
        where.date = { gte: start, lte: end };
      }
    }

    const charges = await db.charge.findMany({
      where,
      orderBy: { date: 'desc' },
    });

    // Top 15 fournisseurs (par total HT) — basé sur les charges filtrées
    const vendorMap = new Map<string, { totalHT: number; count: number; category: string }>();
    for (const c of charges) {
      const name = (c.vendor ?? '').trim() || '(sans fournisseur)';
      const cur = vendorMap.get(name) ?? { totalHT: 0, count: 0, category: c.category };
      cur.totalHT += c.amountHT;
      cur.count += 1;
      vendorMap.set(name, cur);
    }
    const totalHTAll = charges.reduce((s, c) => s + c.amountHT, 0);
    const topVendors = Array.from(vendorMap.entries())
      .map(([vendor, d]) => ({
        vendor,
        totalHT: d.totalHT,
        count: d.count,
        category: d.category,
        pct: totalHTAll > 0 ? (d.totalHT / totalHTAll) * 100 : 0,
      }))
      .sort((a, b) => b.totalHT - a.totalHT)
      .slice(0, 15);

    // Catégories distinctes (pour le filtre dropdown)
    const allCategories = await db.charge.findMany({
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    });

    return NextResponse.json({
      ok: true,
      data: charges,
      topVendors,
      categories: allCategories.map((c) => c.category),
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
        allocationMethod: allocationMethod || (enseigne ? 'DIRECT' : 'GLOBAL'),
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
