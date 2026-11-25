import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/products/marge-estimee/charges-summary?startDate=JJ/MM/AAAA&endDate=JJ/MM/AAAA
 *
 * Retourne les charges de la période agrégées par catégorie, avec pour chaque
 * catégorie: montant total TTC, allocationMethod dominante, et nombre de lignes.
 *
 * Utilisé par la grille tarifaire pour permettre à l'utilisateur de reclasser
 * une catégorie en DIRECT/INDIRECT et déclencher un recalcul de la marge.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const startDateStr = searchParams.get('startDate');
    const endDateStr = searchParams.get('endDate');

    if (!startDateStr || !endDateStr) {
      return NextResponse.json({ ok: false, error: 'startDate et endDate requis (JJ/MM/AAAA)' }, { status: 400 });
    }
    const m1 = startDateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const m2 = endDateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m1 || !m2) {
      return NextResponse.json({ ok: false, error: 'Format date invalide (JJ/MM/AAAA)' }, { status: 400 });
    }
    const start = new Date(parseInt(m1[3]), parseInt(m1[2]) - 1, parseInt(m1[1]));
    const end = new Date(parseInt(m2[3]), parseInt(m2[2]) - 1, parseInt(m2[1]), 23, 59, 59);

    const charges = await db.charge.findMany({
      where: { date: { gte: start, lte: end } },
      select: {
        id: true, category: true, subLabel: true, vendor: true, date: true,
        amountTTC: true, amountHT: true, vatRate: true,
        allocationMethod: true, enseigne: true, excludedFromMargin: true,
      },
    });

    // Agrège par catégorie
    const byCat = new Map<string, { amountTTC: number; amountHT: number; count: number; direct: number; indirect: number; proportional: number; enseignes: Set<string> }>();
    for (const c of charges) {
      const cat = c.category || '(sans catégorie)';
      const cur = byCat.get(cat) ?? { amountTTC: 0, amountHT: 0, count: 0, direct: 0, indirect: 0, proportional: 0, enseignes: new Set<string>() };
      cur.amountTTC += c.amountTTC;
      cur.amountHT += c.amountHT;
      cur.count++;
      if (c.allocationMethod === 'DIRECT') cur.direct++;
      else if (c.allocationMethod === 'PROPORTIONAL') cur.proportional++;
      else cur.indirect++;
      if (c.enseigne) cur.enseignes.add(c.enseigne);
      byCat.set(cat, cur);
    }

    // Détermine l'allocation dominante par catégorie
    const result = Array.from(byCat.entries()).map(([category, v]) => {
      let dominant: 'DIRECT' | 'GLOBAL' | 'PROPORTIONAL' = 'GLOBAL';
      if (v.direct >= v.indirect && v.direct >= v.proportional && v.direct > 0) dominant = 'DIRECT';
      else if (v.proportional > v.indirect && v.proportional > 0) dominant = 'PROPORTIONAL';
      return {
        category,
        amountTTC: v.amountTTC,
        amountHT: v.amountHT,
        count: v.count,
        allocationMethod: dominant,
        directCount: v.direct,
        indirectCount: v.indirect,
        proportionalCount: v.proportional,
        enseignes: Array.from(v.enseignes).slice(0, 3),
      };
    }).sort((a, b) => b.amountTTC - a.amountTTC);

    // Lignes de salaires individuelles (pour toggle + édition dans l'UI).
    // Détecte les catégories "Salaires" / "Rémunération" / "Paie".
    const isSalairesCat = (cat: string) => /salaire|rémunération|paie/i.test(cat || '');
    const salaireLines = charges
      .filter(c => isSalairesCat(c.category))
      .map(c => ({
        id: c.id,
        category: c.category,
        subLabel: c.subLabel,
        vendor: c.vendor,
        date: c.date,
        amountHT: c.amountHT,
        amountTTC: c.amountTTC,
        vatRate: c.vatRate,
        allocationMethod: c.allocationMethod,
        excludedFromMargin: c.excludedFromMargin,
      }))
      .sort((a, b) => b.date.getTime() - a.date.getTime());

    const salairesIncludedTTC = salaireLines
      .filter(s => !s.excludedFromMargin)
      .reduce((s, l) => s + l.amountTTC, 0);
    const salairesExcludedTTC = salaireLines
      .filter(s => s.excludedFromMargin)
      .reduce((s, l) => s + l.amountTTC, 0);

    return NextResponse.json({
      ok: true,
      charges: result,
      total: result.reduce((s, r) => s + r.amountTTC, 0),
      // Détail des lignes de salaires (toggle + édition individuelle)
      salaireLines,
      salairesIncludedTTC,
      salairesExcludedTTC,
      salairesTotalTTC: salairesIncludedTTC + salairesExcludedTTC,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    );
  }
}
