import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const maxDuration = 60;

/**
 * POST /api/products/apply-direct-tariffs
 *
 * Applique les tarifs DIRECT à tous les clients de type "Direct" actifs.
 * Tarifs fournis par l'utilisateur:
 *   - Lot de 2:        tarifDepart = 14.784 €, remise = 5.84%
 *   - Pot individuel:  tarifDepart = 9.856 €,  remise = 5.84%
 *     (finalPrice = tarifDepart × (1 - remise/100))
 *
 * Les "pots individuels" = formats "Indiv PAV 8" et "Indiv Fouro".
 */
export async function POST() {
  try {
    const LOT2_TARIF = 14.784;
    const LOT2_REMISE = 5.84;
    const INDIV_TARIF = 9.856;
    const INDIV_REMISE = 5.84;

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
      ...lot2Products.map((p) => ({ productId: p.id, tarif: LOT2_TARIF, remise: LOT2_REMISE, format: p.format?.name })),
      ...indivProducts.map((p) => ({ productId: p.id, tarif: INDIV_TARIF, remise: INDIV_REMISE, format: p.format?.name })),
    ];

    let upserted = 0;
    let failed = 0;
    for (const enseigne of directNames) {
      for (const t of tarifs) {
        const finalPrice = t.tarif * (1 - t.remise / 100);
        try {
          await db.productSalesPrice.upsert({
            where: { productId_enseigne: { productId: t.productId, enseigne } },
            create: {
              productId: t.productId,
              enseigne,
              tarifDepart: t.tarif,
              remisePercent: t.remise,
              finalPrice,
            },
            update: {
              tarifDepart: t.tarif,
              remisePercent: t.remise,
              finalPrice,
            },
          });
          upserted++;
        } catch {
          failed++;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      directClients: directNames.length,
      lot2Products: lot2Products.length,
      indivProducts: indivProducts.length,
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
