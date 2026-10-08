import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/products/sales-prices
 *   ?productId=... → filtre par produit
 *   ?enseigne=... → filtre par enseigne
 *
 * POST /api/products/sales-prices
 *   Body: { productId, enseigne, tarifDepart, remisePercent?, notes? }
 *   - Calcule finalPrice = tarifDepart × (1 - remisePercent/100)
 *   - Crée ou met à jour (upsert via la contrainte unique [productId, enseigne])
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get('productId') ?? undefined;
    const enseigne = searchParams.get('enseigne') ?? undefined;

    const where: { productId?: string; enseigne?: string } = {};
    if (productId) where.productId = productId;
    if (enseigne) where.enseigne = enseigne;

    const prices = await db.productSalesPrice.findMany({
      where,
      include: { product: { select: { name: true, format: true, potsPerColis: true } } },
      orderBy: [{ enseigne: 'asc' }, { product: { name: 'asc' } }],
    });

    return NextResponse.json({ ok: true, data: prices });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { productId, enseigne, tarifDepart, remisePercent, notes } = body;

    if (!productId || !enseigne || typeof enseigne !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'productId et enseigne requis' },
        { status: 400 }
      );
    }
    if (typeof tarifDepart !== 'number' || tarifDepart < 0) {
      return NextResponse.json(
        { ok: false, error: 'tarifDepart doit être un nombre ≥ 0' },
        { status: 400 }
      );
    }

    const remise = typeof remisePercent === 'number' ? Math.max(0, Math.min(100, remisePercent)) : 0;
    const finalPrice = tarifDepart * (1 - remise / 100);

    // Upsert via la contrainte unique [productId, enseigne]
    const price = await db.productSalesPrice.upsert({
      where: { productId_enseigne: { productId, enseigne: enseigne.trim() } },
      create: {
        productId,
        enseigne: enseigne.trim(),
        tarifDepart,
        remisePercent: remise,
        finalPrice,
        notes: typeof notes === 'string' ? notes : null,
      },
      update: {
        tarifDepart,
        remisePercent: remise,
        finalPrice,
        notes: typeof notes === 'string' ? notes : null,
      },
    });

    return NextResponse.json({ ok: true, data: price });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    );
  }
}
