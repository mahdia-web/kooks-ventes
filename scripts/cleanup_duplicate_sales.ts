// Find and remove duplicate sales from the database.
// Duplicates are identified by having the same BL number + agent,
// or same date + enseigne + amountHT + type (when BL is null).
//
// Run with:
//   DATABASE_URL='postgresql://postgres.uefoknteptnbefgauwhr:VENTEKOOKS2026@aws-0-eu-west-1.pooler.supabase.com:5432/postgres' \
//   npx -y tsx scripts/cleanup_duplicate_sales.ts
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL! } },
});

async function main() {
  console.log('=== Recherche de doublons dans les ventes ===\n');

  // Get all sales sorted by date
  const sales = await db.sale.findMany({
    select: { id: true, blNumber: true, agent: true, date: true, enseigne: true, amountHT: true, type: true, deduplicationKey: true },
    orderBy: { date: 'asc' },
  });
  console.log(`Total ventes en base: ${sales.length}`);

  // Group 1: by BL number + agent (when BL exists)
  const byBL = new Map<string, string[]>();
  for (const s of sales) {
    if (s.blNumber) {
      const key = `${s.blNumber}|${s.agent}`;
      if (!byBL.has(key)) byBL.set(key, []);
      byBL.get(key)!.push(s.id);
    }
  }

  // Group 2: by date+enseigne+type+amountHT (when no BL)
  const byDateEnseigne = new Map<string, string[]>();
  for (const s of sales) {
    if (!s.blNumber) {
      const d = s.date.toISOString().split('T')[0];
      const key = `${d}|${s.enseigne}|${s.type}|${s.amountHT.toFixed(2)}|${s.agent}`;
      if (!byDateEnseigne.has(key)) byDateEnseigne.set(key, []);
      byDateEnseigne.get(key)!.push(s.id);
    }
  }

  // Find duplicates
  const toDelete: string[] = [];
  let blDupCount = 0;
  let dateDupCount = 0;

  for (const [key, ids] of byBL.entries()) {
    if (ids.length > 1) {
      // Keep the first (oldest), delete the rest
      blDupCount += ids.length - 1;
      toDelete.push(...ids.slice(1));
      if (blDupCount <= 10) {
        console.log(`  Doublon BL: ${key} → ${ids.length} occurrences (garde 1, supprime ${ids.length - 1})`);
      }
    }
  }

  for (const [key, ids] of byDateEnseigne.entries()) {
    if (ids.length > 1) {
      // Keep the first, delete the rest
      dateDupCount += ids.length - 1;
      toDelete.push(...ids.slice(1));
      if (dateDupCount <= 10) {
        console.log(`  Doublon date+enseigne: ${key} → ${ids.length} occurrences (garde 1, supprime ${ids.length - 1})`);
      }
    }
  }

  // Deduplicate the toDelete list (a sale could appear in both groups)
  const uniqueToDelete = [...new Set(toDelete)];

  console.log(`\n=== Résumé ===`);
  console.log(`  Doublons par BL: ${blDupCount}`);
  console.log(`  Doublons par date+enseigne: ${dateDupCount}`);
  console.log(`  Total à supprimer (unique): ${uniqueToDelete.length}`);

  // Calculate the over-counted amount
  const dupSales = sales.filter(s => uniqueToDelete.includes(s.id));
  const dupAmount = dupSales.reduce((sum, s) => sum + s.amountHT, 0);
  console.log(`  Montant sur-compté: ${formatEuro(dupAmount)}`);

  if (uniqueToDelete.length === 0) {
    console.log('\n[FINI] Aucun doublon trouvé.');
    await db.$disconnect();
    return;
  }

  // Delete in batches
  const BATCH = 200;
  let deleted = 0;
  for (let i = 0; i < uniqueToDelete.length; i += BATCH) {
    const batch = uniqueToDelete.slice(i, i + BATCH);
    const r = await db.sale.deleteMany({ where: { id: { in: batch } } });
    deleted += r.count;
    console.log(`  Batch ${i / BATCH + 1}: ${r.count} supprimées`);
  }

  // Recalculate totals
  const remaining = await db.sale.count();
  const totalCA = await db.sale.aggregate({ _sum: { amountHT: true } });
  console.log(`\n=== Après nettoyage ===`);
  console.log(`  Ventes restantes: ${remaining}`);
  console.log(`  CA total HT: ${formatEuro(totalCA._sum.amountHT ?? 0)}`);

  await db.$disconnect();
  console.log('\n[FINI] Nettoyage terminé');
}

function formatEuro(n: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n);
}

main().catch((e) => {
  console.error('[ERREUR]', e);
  process.exit(1);
});
