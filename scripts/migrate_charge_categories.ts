// Migration script: convert raw PCG account numbers (e.g. "60614000") stored
// in Charge.category to readable French labels (e.g. "Carburant") using the
// mapping in src/lib/compte-comptable.ts.
//
// Run with:
//   DATABASE_URL='postgresql://postgres.uefoknteptnbefgauwhr:VENTEKOOKS2026@aws-0-eu-west-1.pooler.supabase.com:5432/postgres' \
//   npx -y tsx scripts/migrate_charge_categories.ts
import { PrismaClient } from '@prisma/client';
import { labelForCompte } from '../src/lib/compte-comptable';

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL! } },
});

async function main() {
  // 1. Récupère toutes les catégories distinctes
  const distinctCategories = await db.charge.findMany({
    select: { category: true },
    distinct: ['category'],
  });

  console.log(`[INFO] ${distinctCategories.length} catégories distinctes trouvées`);

  // 2. Pour chaque catégorie, calcule le nouveau libellé lisible
  let updated = 0;
  let skipped = 0;
  for (const { category } of distinctCategories) {
    if (!category) {
      console.log('  [SKIP] catégorie vide');
      continue;
    }
    const label = labelForCompte(category);
    if (label === category) {
      // Pas de mapping trouvé — on garde la valeur d'origine
      skipped++;
      continue;
    }
    console.log(`  ${category!r} → ${label}`);
    const result = await db.charge.updateMany({
      where: { category },
      data: { category: label },
    });
    console.log(`     ${result.count} lignes mises à jour`);
    updated += result.count;
  }

  console.log('\n=== Récapitulatif ===');
  console.log(`  ${updated} lignes mises à jour (catégorie → libellé lisible)`);
  console.log(`  ${skipped} lignes sans mapping (gardées telles quelles)`);

  await db.$disconnect();
  console.log('\n[FINI] Migration terminée');
}

main().catch((e) => {
  console.error('[ERREUR]', e);
  process.exit(1);
});
