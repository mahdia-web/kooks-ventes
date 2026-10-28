// Merge all LECLERC SCAOUEST stores into the main SCAOUEST cooperative.
//
// These individual Leclerc stores are now part of the SCAOUEST centrale
// and should be treated as ONE entity:
//
//   "SOCIETE COOPERATIVE D'APPROVISIONNEMENT DE L'OUEST" (the canonical name)
//
// Stores to merge (all containing "SCAOUEST" except the canonical one):
//   - LECLERC SCAOUEST SAINT HERBLAIN DISTRIBUTION
//   - LECLERC SCAOUEST (SAS BLAINDIS)
//   - SAS LECLERC SCAOUEST SAUMUR- SAS SAUDIS
//   - SAS SOCIETE DE DISTRIBUTION DU PAYS DE RETZ (LECLERC SCAOUEST)
//   - SAS LECLERC REZE OCEANE - SCAOUEST - SUD LOIRE DISTRIBUTION
//   - LECLERC ST NAZAIRE SCAOUEST (SAS SODIJOUR)
//   - SAS LECLERC BASSE GOULAINE SCAOUEST(LAURY CHALONGES DIS)
//
// Run with:
//   DATABASE_URL='postgresql://postgres.uefoknteptnbefgauwhr:VENTEKOOKS2026@aws-0-eu-west-1.pooler.supabase.com:5432/postgres' \
//   npx -y tsx scripts/merge_scaouest_stores.ts
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL! } },
});

async function main() {
  const CANONICAL = "SOCIETE COOPERATIVE D'APPROVISIONNEMENT DE L'OUEST";

  // Find the canonical enseigne
  const canonical = await db.enseigne.findUnique({ where: { name: CANONICAL } });
  if (!canonical) {
    // Try alternate names
    const altNames = [
      "SA SOCIETE COOPERATIVE D'APPROVISIONNEMENT DE L'OUEST ( SCAOUEST )",
      "SOCIETE COOPERATIVE D'APPROVISIONNEMENT DE L'OUEST ( SCAOUEST )",
    ];
    let found = null;
    for (const alt of altNames) {
      found = await db.enseigne.findUnique({ where: { name: alt } });
      if (found) break;
    }
    if (!found) {
      console.error(`Canonical enseigne "${CANONICAL}" not found. Looking for SCAOUEST variants...`);
      const allScaouest = await db.enseigne.findMany({
        where: { name: { contains: 'SCAOUEST', mode: 'insensitive' } },
      });
      console.log('Found SCAOUEST enseignes:');
      for (const e of allScaouest) {
        console.log(`  ${e.name} (type=${e.type}, agent=${e.agent})`);
      }
      // Pick the one with the most sales as canonical
      let bestCount = 0;
      for (const e of allScaouest) {
        const count = await db.sale.count({ where: { enseigne: e.name } });
        if (count > bestCount) {
          bestCount = count;
          found = e;
        }
      }
      if (!found) {
        console.error('No SCAOUEST enseigne found at all!');
        process.exit(1);
      }
      console.log(`Using "${found.name}" as canonical (most sales: ${bestCount})`);
    }
  }

  const canonicalName = canonical?.name ?? (await db.enseigne.findFirst({
    where: { name: { contains: 'SCAOUEST', mode: 'insensitive' } },
  }))?.name;

  if (!canonicalName) {
    console.error('Could not determine canonical name');
    process.exit(1);
  }

  console.log(`Canonical: "${canonicalName}"`);

  // Find all enseignes containing SCAOUEST (excluding the canonical)
  const duplicates = await db.enseigne.findMany({
    where: {
      name: { contains: 'SCAOUEST', mode: 'insensitive' },
      NOT: { name: canonicalName },
    },
  });

  console.log(`\nFound ${duplicates.length} stores to merge:`);
  for (const d of duplicates) {
    const saleCount = await db.sale.count({ where: { enseigne: d.name } });
    const caTotal = await db.sale.aggregate({
      where: { enseigne: d.name },
      _sum: { amountHT: true },
    });
    console.log(`  "${d.name}" — ${saleCount} ventes, ${caTotal._sum.amountHT?.toFixed(0) ?? 0}€`);
  }

  if (duplicates.length === 0) {
    console.log('Nothing to merge.');
    await db.$disconnect();
    return;
  }

  // For each duplicate:
  // 1. Update all sales: enseigne → canonicalName, type → Centrale
  // 2. Delete the duplicate enseigne record
  let totalSalesUpdated = 0;
  let totalEnseignesDeleted = 0;

  for (const dup of duplicates) {
    console.log(`\nMerging "${dup.name}" → "${canonicalName}"...`);

    // Update sales
    const result = await db.sale.updateMany({
      where: { enseigne: dup.name },
      data: { enseigne: canonicalName, type: 'Centrale' },
    });
    console.log(`  ${result.count} ventes mises à jour`);
    totalSalesUpdated += result.count;

    // Also update VolumeSale if any
    const volResult = await db.volumeSale.updateMany({
      where: { enseigne: dup.name },
      data: { enseigne: canonicalName },
    });
    if (volResult.count > 0) {
      console.log(`  ${volResult.count} volumes mis à jour`);
    }

    // Delete the duplicate enseigne
    try {
      await db.enseigne.delete({ where: { id: dup.id } });
      console.log(`  Enseigne supprimée`);
      totalEnseignesDeleted++;
    } catch (e) {
      console.error(`  Erreur suppression enseigne:`, e instanceof Error ? e.message : String(e));
    }
  }

  // Also update the canonical enseigne to be Centrale type
  await db.enseigne.update({
    where: { name: canonicalName },
    data: { type: 'Centrale' },
  });
  console.log(`\nCanonical enseigne mise à jour (type=Centrale)`);

  // Verify
  const remainingScaouest = await db.enseigne.findMany({
    where: { name: { contains: 'SCAOUEST', mode: 'insensitive' } },
  });
  console.log(`\n=== Résultat ===`);
  console.log(`  Enseignes SCAOUEST restantes: ${remainingScaouest.length}`);
  for (const e of remainingScaouest) {
    const count = await db.sale.count({ where: { enseigne: e.name } });
    console.log(`    "${e.name}" — ${count} ventes`);
  }
  console.log(`  Ventes mises à jour: ${totalSalesUpdated}`);
  console.log(`  Enseignes supprimées: ${totalEnseignesDeleted}`);

  await db.$disconnect();
  console.log('\n[FINI] Fusion terminée');
}

main().catch((e) => {
  console.error('[ERREUR]', e);
  process.exit(1);
});
