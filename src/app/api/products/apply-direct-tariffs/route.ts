import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const maxDuration = 60;

/**
 * POST /api/products/apply-direct-tariffs?batch=N&size=M
 *
 * Applique les tarifs DIRECT aux clients de type "Direct" actifs.
 * Comme il y a ~87 clients × 13 produits = 1131 upserts, on traite par
 * lots (batch/size) pour rester sous la limite Vercel de 60s.
 *   batch=0&size=400 → clients 0..399
 *   batch=400&size=400 → clients 400..799
 *   batch=800&size=400 → clients 800..1131
 * Sans paramètres: traite TOUT (peut expirer si trop d'opérations).
 */
export async function POST(req: NextRequest) {
  try {
    const LOT2_TARIF = 14.784;
    const LOT2_REMISE = 5.84;
    const INDIV_TARIF = 9.856;
    const INDIV_REMISE = 5.84;

    const { searchParams } = new URL(req.url);
    const batchStart = parseInt(searchParams.get('batch') || '0', 10);
    const batchSize = parseInt(searchParams.get('size') || '0', 10); // 0 = tout

    // 1. Enseignes Direct actives
    const directEnseignes = await db.enseigne.findMany({
      where: { isActive: true, type: 'Direct' },
      select: { name: true },
    });
    const directNames = directEnseignes.map((e) => e.name);

    // 2. Produits Lot de 2 + Indiv
    const products = await db.product.findMany({
      where: { isActive: true, formatId: { not: null } },
      include: { format: true },
    });
    const lot2Products = products.filter((p) => /lot de 2/i.test(p.format?.name ?? ''));
    const indivProducts = products.filter((p) => /indiv/i.test(p.format?.name ?? ''));

    const tarifs = [
      ...lot2Products.map((p) => ({ productId: p.id, tarif: LOT2_TARIF, remise: LOT2_REMISE })),
      ...indivProducts.map((p) => ({ productId: p.id, tarif: INDIV_TARIF, remise: INDIV_REMISE })),
    ];

    // Construit toutes les opérations
    const operations: Array<{ enseigne: string; productId: string; tarif: number; remise: number; final: number }> = [];
    for (const enseigne of directNames) {
      for (const t of tarifs) {
        const finalPrice = t.tarif * (1 - t.remise / 100);
        operations.push({ enseigne, productId: t.productId, tarif: t.tarif, remise: t.remise, final: finalPrice });
      }
    }

    const total = operations.length;
    const slice = batchSize > 0 ? operations.slice(batchStart, batchStart + batchSize) : operations;
    let upserted = 0;
    let failed = 0;

    // Lots de 25 opérations en parallèle
    const PARALLEL = 25;
    for (let i = 0; i < slice.length; i += PARALLEL) {
      const batch = slice.slice(i, i + PARALLEL);
      const results = await Promise.allSettled(batch.map((op) =>
        db.productSalesPrice.upsert({
          where: { productId_enseigne: { productId: op.productId, enseigne: op.enseigne } },
          create: {
            productId: op.productId,
            enseigne: op.enseigne,
            tarifDepart: op.tarif,
            remisePercent: op.remise,
            finalPrice: op.final,
          },
          update: {
            tarifDepart: op.tarif,
            remisePercent: op.remise,
            finalPrice: op.final,
          },
        })
      ));
      for (const r of results) {
        if (r.status === 'fulfilled') upserted++;
        else failed++;
      }
    }

    return NextResponse.json({
      ok: true,
      directClients: directNames.length,
      lot2Products: lot2Products.length,
      indivProducts: indivProducts.length,
      totalOperations: total,
      batchStart,
      batchSize: batchSize > 0 ? batchSize : total,
      processed: slice.length,
      upserted,
      failed,
      tarifs: {
        lot2: { tarif: LOT2_TARIF, remise: LOT2_REMISE, final: +(LOT2_TARIF * (1 - LOT2_REMISE / 100)).toFixed(3) },
        indiv: { tarif: INDIV_TARIF, remise: INDIV_REMISE, final: +(INDIV_TARIF * (1 - INDIV_REMISE / 100)).toFixed(3) },
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur serveur' },
      { status: 500 },
    );
  }
}
