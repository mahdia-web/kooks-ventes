import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/migrations/diagnose-parfums
 *
 * Route de diagnostic temporaire pour identifier les écarts entre
 * VolumeSale.parfum/format (free-text) et Product.parfum.name/format.name
 * (catalogue canonique).
 *
 * Retourne:
 *   - catalogueParfums: liste des parfums canoniques (Product.parfum.name)
 *   - catalogueFormats: liste des formats canoniques (Product.format.name)
 *   - volumeParfums: liste des valeurs distinctes de VolumeSale.parfum avec
 *     nb lignes et nb colis
 *   - volumeFormats: liste des valeurs distinctes de VolumeSale.format
 *   - unmatched: lignes VolumeSale dont le (parfum, format) ne matche aucun
 *     produit du catalogue (après normalisation)
 */
export async function GET() {
  try {
    // Catalogue canonique
    const products = await db.product.findMany({
      where: { isActive: true, parfumId: { not: null }, formatId: { not: null } },
      include: { parfum: true, format: true },
    });
    const catalogueParfums = Array.from(new Set(products.map(p => p.parfum?.name).filter(Boolean))) as string[];
    const catalogueFormats = Array.from(new Set(products.map(p => p.format?.name).filter(Boolean))) as string[];

    const norm = (s: string | null | undefined) =>
      (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[''`]/g, '').trim();

    // Clés canoniques du catalogue
    const catalogueKeys = new Set(
      products.map(p => `${norm(p.parfum?.name)}__${norm(p.format?.name)}`)
    );

    // VolumeSale: valeurs distinctes de parfum et format
    const volumes = await db.volumeSale.findMany({
      select: { parfum: true, format: true, quantity: true, unitPrice: true, productLabel: true },
    });

    // Agrégation par parfum
    const byParfum = new Map<string, { lignes: number; colis: number; ca: number }>();
    const byFormat = new Map<string, { lignes: number; colis: number; ca: number }>();
    const byKey = new Map<string, { parfum: string; format: string; lignes: number; colis: number; ca: number; labels: Set<string> }>();

    let nullParfum = 0, nullFormat = 0;
    for (const v of volumes) {
      if (!v.parfum) nullParfum++;
      if (!v.format) nullFormat++;
      const p = v.parfum ?? '(null)';
      const f = v.format ?? '(null)';
      const ca = v.quantity * (v.unitPrice ?? 0);

      const pe = byParfum.get(p) ?? { lignes: 0, colis: 0, ca: 0 };
      pe.lignes++; pe.colis += v.quantity; pe.ca += ca;
      byParfum.set(p, pe);

      const fe = byFormat.get(f) ?? { lignes: 0, colis: 0, ca: 0 };
      fe.lignes++; fe.colis += v.quantity; fe.ca += ca;
      byFormat.set(f, fe);

      const key = `${norm(v.parfum)}__${norm(v.format)}`;
      const ke = byKey.get(key) ?? { parfum: p, format: f, lignes: 0, colis: 0, ca: 0, labels: new Set<string>() };
      ke.lignes++; ke.colis += v.quantity; ke.ca += ca;
      if (v.productLabel) ke.labels.add(v.productLabel);
      byKey.set(key, ke);
    }

    // Unmatched: clés VolumeSale qui ne matchent aucune clé catalogue
    const unmatched: Array<{ parfum: string; format: string; key: string; lignes: number; colis: number; ca: number; labels: string[] }> = [];
    const matched: Array<{ parfum: string; format: string; key: string; lignes: number; colis: number; ca: number }> = [];
    for (const [key, v] of byKey) {
      if (key === '__' || key.startsWith('(null)') || key.endsWith('_(null)')) continue;
      if (catalogueKeys.has(key)) {
        matched.push({ parfum: v.parfum, format: v.format, key, lignes: v.lignes, colis: v.colis, ca: v.ca });
      } else {
        unmatched.push({ parfum: v.parfum, format: v.format, key, lignes: v.lignes, colis: v.colis, ca: v.ca, labels: Array.from(v.labels).slice(0, 5) });
      }
    }

    unmatched.sort((a, b) => b.ca - a.ca);
    matched.sort((a, b) => b.ca - a.ca);

    return NextResponse.json({
      ok: true,
      stats: {
        totalVolumes: volumes.length,
        nullParfum,
        nullFormat,
        catalogueParfumsCount: catalogueParfums.length,
        catalogueFormatsCount: catalogueFormats.length,
        unmatchedKeys: unmatched.length,
        matchedKeys: matched.length,
      },
      catalogueParfums,
      catalogueFormats,
      volumeParfums: Array.from(byParfum.entries())
        .map(([p, v]) => ({ parfum: p, ...v }))
        .sort((a, b) => b.ca - a.ca),
      volumeFormats: Array.from(byFormat.entries())
        .map(([f, v]) => ({ format: f, ...v }))
        .sort((a, b) => b.ca - a.ca),
      unmatched,
      matched,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    );
  }
}
