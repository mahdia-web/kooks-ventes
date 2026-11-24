import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/migrations/diagnose-sachet3
 *
 * Liste tous les mois où apparaissent des labels contenant SAC/SACHET/5 KG
 * pour comprendre sur quelle période ces lignes existent.
 */
export async function GET() {
  try {
    const volumes = await db.volumeSale.findMany({
      where: {
        OR: [
          { productLabel: { contains: 'SAC', mode: 'insensitive' } },
          { productLabel: { contains: 'SACHET', mode: 'insensitive' } },
          { productLabel: { contains: '5 KG', mode: 'insensitive' } },
          { productLabel: { contains: '5KG', mode: 'insensitive' } },
        ],
      },
      select: { year: true, month: true, productLabel: true, quantity: true, unitPrice: true, parfum: true, format: true },
    });

    // Par mois
    const byMonth = new Map<string, { count: number; colis: number; ca: number; labels: Set<string> }>();
    for (const v of volumes) {
      const key = `${v.year}-${String(v.month).padStart(2, '0')}`;
      const cur = byMonth.get(key) ?? { count: 0, colis: 0, ca: 0, labels: new Set<string>() };
      cur.count++; cur.colis += v.quantity; cur.ca += v.quantity * (v.unitPrice ?? 0);
      cur.labels.add(v.productLabel || '');
      byMonth.set(key, cur);
    }

    return NextResponse.json({
      ok: true,
      totalMatching: volumes.length,
      byMonth: Array.from(byMonth.entries())
        .map(([month, v]) => ({ month, count: v.count, colis: v.colis, ca: v.ca, labels: Array.from(v.labels).slice(0, 5) }))
        .sort((a, b) => a.month.localeCompare(b.month)),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    );
  }
}
