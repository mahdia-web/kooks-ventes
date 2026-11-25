import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * PATCH /api/charges/reclassify-category
 *
 * Reclassifie TOUTES les charges d'une catégorie sur une période donnée vers une
 * nouvelle allocationMethod ('DIRECT' | 'GLOBAL' | 'PROPORTIONAL').
 *
 * Body:
 *   { category: string, startDate: "JJ/MM/AAAA", endDate: "JJ/MM/AAAA",
 *     allocationMethod: "DIRECT" | "GLOBAL" | "PROPORTIONAL" }
 *
 * Utilisé par la grille tarifaire pour basculer une catégorie de charges entre
 * direct/indirect et déclencher un recalcul de la marge.
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { category, startDate, endDate, allocationMethod } = body;

    if (!category || !startDate || !endDate || !allocationMethod) {
      return NextResponse.json({ ok: false, error: 'category, startDate, endDate, allocationMethod requis' }, { status: 400 });
    }
    if (!['DIRECT', 'GLOBAL', 'PROPORTIONAL'].includes(allocationMethod)) {
      return NextResponse.json({ ok: false, error: 'allocationMethod doit être DIRECT, GLOBAL ou PROPORTIONAL' }, { status: 400 });
    }

    const m1 = String(startDate).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const m2 = String(endDate).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m1 || !m2) {
      return NextResponse.json({ ok: false, error: 'Format date invalide (JJ/MM/AAAA)' }, { status: 400 });
    }
    const start = new Date(parseInt(m1[3]), parseInt(m1[2]) - 1, parseInt(m1[1]));
    const end = new Date(parseInt(m2[3]), parseInt(m2[2]) - 1, parseInt(m2[1]), 23, 59, 59);

    const result = await db.charge.updateMany({
      where: {
        category,
        date: { gte: start, lte: end },
      },
      data: { allocationMethod },
    });

    return NextResponse.json({
      ok: true,
      category,
      allocationMethod,
      updated: result.count,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    );
  }
}
