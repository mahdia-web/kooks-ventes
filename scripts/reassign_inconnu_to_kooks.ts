// One-time cleanup script:
// 1. Reassign all Sales with agent='Inconnu' to agent="KOOK'S"
// 2. For those sales, set rate=0 and commission=0 (KOOK'S has 0% commission)
// 3. Rebuild the Enseigne table's agent field from the most recent sale per enseigne
//    (so clients with KOOK'S sales show up under KOOK'S in the clients base)
//
// Run with:
//   DATABASE_URL='postgresql://postgres.uefoknteptnbefgauwhr:VENTEKOOKS2026@aws-0-eu-west-1.pooler.supabase.com:5432/postgres' \
//   DIRECT_URL="$DATABASE_URL" \
//   npx -y tsx scripts/reassign_inconnu_to_kooks.ts
//
// IMPORTANT: do not commit this file with the credentials embedded.
import { PrismaClient } from '@prisma/client';

async function main() {
  const db = new PrismaClient({
    datasources: {
      db: { url: process.env.DATABASE_URL! },
    },
  });

  // 1. Find the KOOK'S agent (to validate it exists)
  const kooks = await db.agent.findFirst({ where: { name: { contains: 'KOOK' } } });
  if (!kooks) {
    throw new Error("Agent KOOK'S not found in database. Create it first.");
  }
  console.log(`[OK] Agent trouvé : ${kooks.name} (id=${kooks.id}) direct=${kooks.defaultDirectRate} centrale=${kooks.defaultCentraleRate}`);

  // 2. Reassign all 'Inconnu' sales to KOOK'S, set rate=0 and commission=0
  const unknownSales = await db.sale.findMany({
    where: { agent: 'Inconnu' },
    select: { id: true, enseigne: true, amountHT: true },
  });
  console.log(`[INFO] ${unknownSales.length} ventes avec agent='Inconnu' à réaffecter`);

  if (unknownSales.length > 0) {
    // Update in batches of 200 to avoid long transactions
    const BATCH = 200;
    let totalUpdated = 0;
    for (let i = 0; i < unknownSales.length; i += BATCH) {
      const batch = unknownSales.slice(i, i + BATCH);
      const res = await db.sale.updateMany({
        where: { id: { in: batch.map(s => s.id) } },
        data: {
          agent: kooks.name,
          rate: 0,
          commission: 0,
        },
      });
      totalUpdated += res.count;
      console.log(`  batch ${i / BATCH + 1}: ${res.count} ventes mises à jour`);
    }
    console.log(`[OK] ${totalUpdated} ventes réaffectées à ${kooks.name} (rate=0, commission=0)`);
  }

  // 3. Rebuild the Enseigne.agent field from the latest sale per enseigne
  //    For each enseigne name in the Enseigne table, find the most recent sale
  //    and use its agent as the new Enseigne.agent.
  const allEnseignes = await db.enseigne.findMany({ select: { id: true, name: true, agent: true } });
  console.log(`[INFO] ${allEnseignes.length} enseignes à vérifier`);

  let updatedEnseignes = 0;
  let kooksEnseignesCount = 0;
  for (const ens of allEnseignes) {
    const latestSale = await db.sale.findFirst({
      where: { enseigne: ens.name },
      orderBy: { date: 'desc' },
      select: { agent: true, type: true },
    });
    if (!latestSale) continue;
    if (latestSale.agent !== ens.agent) {
      await db.enseigne.update({
        where: { id: ens.id },
        data: { agent: latestSale.agent, type: latestSale.type },
      });
      updatedEnseignes++;
      if (latestSale.agent === kooks.name) kooksEnseignesCount++;
    }
  }
  console.log(`[OK] ${updatedEnseignes} enseignes mises à jour (dont ${kooksEnseignesCount} affectées à ${kooks.name})`);

  // 4. Summary
  const byAgent = await db.sale.groupBy({
    by: ['agent'],
    _count: { _all: true },
    _sum: { amountHT: true, commission: true },
  });
  console.log('\n=== Récapitulatif ventes par agent ===');
  for (const r of byAgent) {
    console.log(`  ${r.agent}: ${r._count._all} BL, CA=${r._sum.amountHT?.toFixed(2)}€, commission=${r._sum.commission?.toFixed(2)}€`);
  }

  const ensByAgent = await db.enseigne.groupBy({
    by: ['agent'],
    _count: { _all: true },
  });
  console.log('\n=== Récapitulatif enseignes par agent ===');
  for (const r of ensByAgent) {
    console.log(`  ${r.agent}: ${r._count._all} enseignes`);
  }

  await db.$disconnect();
  console.log('\n[FINI] Réaffectation terminée');
}

main().catch((e) => {
  console.error('[ERREUR]', e);
  process.exit(1);
});
