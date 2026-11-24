import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/migrations/diagnose-sachet2?year=2026&month=10
 *
 * Liste brute des VolumeSale d'octobre dont productLabel contient "SAC" ou "SACHET"
 * ou "5 KG" ou "5KG" pour comprendre pourquoi la regex ne matche pas.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get('year') ?? '2026', 10);
    const month = parseInt(searchParams.get('month') ?? '10', 10);

    const volumes = await db.volumeSale.findMany({
      where: { year, month },
      select: { parfum: true, format: true, quantity: true, unitPrice: true, productLabel: true, enseigne: true },
    });

    // Tous les labels distincts contenant SAC, SACHET, ou 5 KG
    const matching = volumes.filter(v => {
      const l = (v.productLabel || '').toUpperCase();
      return l.includes('SAC') || l.includes('5 KG') || l.includes('5KG');
    });

    // Groupage par productLabel
    const byLabel = new Map<string, { count: number; colis: number; ca: number; parfum: string | null; format: string | null }>();
    for (const v of matching) {
      const lbl = v.productLabel || '(null)';
      const cur = byLabel.get(lbl) ?? { count: 0, colis: 0, ca: 0, parfum: v.parfum, format: v.format };
      cur.count++; cur.colis += v.quantity; cur.ca += v.quantity * (v.unitPrice ?? 0);
      byLabel.set(lbl, cur);
    }

    return NextResponse.json({
      ok: true,
      totalVolumes: volumes.length,
      matchingCount: matching.length,
      labels: Array.from(byLabel.entries())
        .map(([label, v]) => ({ label, ...v }))
        .sort((a, b) => b.ca - a.ca),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    );
  }
}
