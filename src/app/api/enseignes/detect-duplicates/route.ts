import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { normalizeEnseigne } from '@/lib/normalize-enseigne';

/**
 * GET /api/enseignes/detect-duplicates
 *
 * Retourne les groupes d'enseignes qui sont des doublons (mêmes magasins
 * avec des écritures différentes).
 *
 * Chaque groupe contient :
 *   - normalized : la forme canonique calculée
 *   - items : les enseignes (id, name, type, agent, isActive) qui partagent cette forme
 *
 * Un groupe n'est renvoyé que s'il a 2+ enseignes.
 */
export async function GET() {
  try {
    const enseignes = await db.enseigne.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        agent: true,
        isActive: true,
        commissionRate: true,
      },
      orderBy: { name: 'asc' },
    });

    // Grouper par nom normalisé
    const groups = new Map<string, typeof enseignes>();
    for (const e of enseignes) {
      const key = normalizeEnseigne(e.name);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(e);
    }

    // Ne garder que les groupes avec 2+ enseignes
    const duplicates = Array.from(groups.entries())
      .filter(([, items]) => items.length > 1)
      .map(([normalized, items]) => ({
        normalized,
        items: items.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => b.items.length - a.items.length);

    return NextResponse.json({
      ok: true,
      data: duplicates,
      total: duplicates.length,
      totalDuplicates: duplicates.reduce((s, g) => s + g.items.length, 0),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    );
  }
}
