import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const maxDuration = 60;

/**
 * POST /api/migrations/fix-box9-pots
 *
 * Corrige le potsPerColis du format "Box de 9" : 36 → 9.
 *
 * Contexte :
 *   - L'utilisateur a signalé que le PV par pot des Box de 9 était faux.
 *     Costco vend le Box de 9 à 8,95 €/colis, et le vrai PV par pot est ~0,994 € (8,95/9),
 *     pas 0,249 € (8,95/36) comme l'appli affichait.
 *   - Cause racine : Format.potsPerColis pour "Box de 9" = 36 (interprété comme
 *     4 boîtes × 9 pots), alors qu'un colis vendu ne contient en réalité qu'1 boîte de 9 pots.
 *
 * Effet :
 *   - Le PV moyen par pot et le nombre de pots vendus seront recalculés correctement
 *     dans /api/products/marge-estimee et /api/volumes/clients-analysis.
 *   - Les marges brutes/nettes par pot des Box de 9 deviendront positives et cohérentes
 *     avec les autres formats.
 *
 * Note : le pricePerPot des ProductPurchasePrice Box de 9 (actuellement 0,491 €,
 * calculé avec l'ancien ppc=36) n'est PAS recalculé ici. Il reste 0,491 €/pot, ce qui
 * correspond à un pricePerColis de 4,42 € (0,491 × 9) si le nouveau ppc=9 est appliqué
 * rétroactivement — mais le pricePerColis stocké est 17,68 €. L'utilisateur devra
 * vérifier ce prix d'achat séparément.
 */
export async function POST() {
  console.log('[fix-box9-pots] Starting migration');

  try {
    const before = await db.format.findFirst({
      where: { name: 'Box de 9' },
      select: { id: true, name: true, potsPerColis: true, potsPerFormat: true, unitesFormatPerColis: true, colisPerPalette: true, potsPerPalette: true },
    });
    console.log('[fix-box9-pots] Before:', before);

    if (!before) {
      return NextResponse.json({ ok: false, error: 'Format "Box de 9" introuvable' }, { status: 404 });
    }

    if (before.potsPerColis === 9) {
      return NextResponse.json({
        ok: true,
        message: 'Format Box de 9 déjà à potsPerColis=9, aucune modification nécessaire',
        before,
        after: before,
      });
    }

    // Compte les produits + prix d'achat concernés (pour info)
    const productsBox9 = await db.product.findMany({
      where: { formatId: before.id },
      select: {
        id: true, name: true,
        purchasePrices: { where: { endDate: null }, select: { pricePerPot: true, pricePerColis: true } },
      },
    });
    const purchaseCount = productsBox9.reduce((s, p) => s + p.purchasePrices.length, 0);

    // Applique la correction
    const after = await db.format.update({
      where: { id: before.id },
      data: { potsPerColis: 9 },
      select: { name: true, potsPerColis: true, potsPerFormat: true, unitesFormatPerColis: true, colisPerPalette: true, potsPerPalette: true },
    });
    console.log('[fix-box9-pots] After:', after);

    return NextResponse.json({
      ok: true,
      message: 'Format "Box de 9" corrigé : potsPerColis 36 → 9',
      before,
      after,
      stats: {
        productsAffected: productsBox9.length,
        purchasePricesAffected: purchaseCount,
        note: 'pricePerPot non recalculé — vérifier le pricePerColis Box de 9 (actuellement 17.68 €, semble élevé)',
      },
    });
  } catch (e) {
    console.error('[fix-box9-pots] Error:', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur serveur' },
      { status: 500 }
    );
  }
}
