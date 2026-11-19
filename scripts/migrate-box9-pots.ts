/**
 * Migration : corrige potsPerColis pour Box de 9 (36 → 9)
 *
 * Contexte :
 *   - L'utilisateur a signalé que le PV par pot des Box de 9 était faux.
 *   - Costco vend le Box de 9 à 8,95 €/colis, et le vrai PV par pot est ~0,994 € (8,95/9),
 *     pas 0,249 € (8,95/36).
 *   - Cause racine : Format.potsPerColis pour "Box de 9" = 36 (4 boîtes × 9 pots),
 *     alors que le colis vendu ne contient en réalité qu'1 boîte de 9 pots.
 *
 * Cette migration :
 *   1. Met à jour Format.potsPerColis : 36 → 9 pour le format "Box de 9"
 *   2. Corrige FORMAT_POTS['Box de 9'] dans clients-analysis/route.ts (hardcodé)
 *
 * NOTE sur les prix d'achat :
 *   Le pricePerPot actuel (0,491 €) a été calculé comme 17,68/36 (avec l'ancien ppc=36).
 *   On NE le modifie PAS ici car le pricePerColis (17,68 €) est une donnée métier saisie
 *   par l'utilisateur, et nous ne savons pas s'il correspond à 9 ou 36 pots.
 *   → Si l'utilisateur confirme que le colis d'achat contient 9 pots, il faudra aussi
 *     recalculer pricePerPot = pricePerColis / 9 pour chaque ProductPurchasePrice Box de 9.
 */
import { db } from '@/lib/db';

async function main() {
  console.log('=== Avant correction ===');
  const formatBefore = await db.format.findFirst({
    where: { name: 'Box de 9' },
    select: { id: true, name: true, potsPerColis: true, potsPerFormat: true, unitesFormatPerColis: true, colisPerPalette: true, potsPerPalette: true },
  });
  console.log('Format Box de 9:', formatBefore);

  // Compte les produits Box de 9 concernés
  const productsBox9 = await db.product.findMany({
    where: { format: { name: 'Box de 9' } },
    select: { id: true, name: true, purchasePrices: { where: { endDate: null }, select: { pricePerPot: true, pricePerColis: true } } },
  });
  console.log(`Produits Box de 9 concernés: ${productsBox9.length}`);
  for (const p of productsBox9) {
    const pp = p.purchasePrices[0];
    console.log(`  - ${p.name}: achatPot=${pp?.pricePerPot} achatColis=${pp?.pricePerColis}`);
  }

  // 1. Corrige Format.potsPerColis pour Box de 9 : 36 → 9
  if (formatBefore && formatBefore.potsPerColis === 36) {
    const updated = await db.format.update({
      where: { id: formatBefore.id },
      data: { potsPerColis: 9 },
      select: { name: true, potsPerColis: true },
    });
    console.log('\n✓ Format Box de 9 mis à jour:', updated);
  } else if (formatBefore) {
    console.log(`\n⚠ Format Box de 9 a déjà potsPerColis=${formatBefore.potsPerColis} (pas 36), aucune modif nécessaire.`);
  } else {
    console.log('\n⚠ Aucun format "Box de 9" trouvé en base.');
  }

  // 2. Vérification après correction
  console.log('\n=== Après correction ===');
  const formatAfter = await db.format.findFirst({
    where: { name: 'Box de 9' },
    select: { name: true, potsPerColis: true, potsPerFormat: true, unitesFormatPerColis: true },
  });
  console.log('Format Box de 9:', formatAfter);

  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
