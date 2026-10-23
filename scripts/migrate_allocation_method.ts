// Migration script: intelligently reassign allocationMethod (DIRECT/GLOBAL)
// for all existing charges based on compta analytique principles.
//
// Before: allocationMethod was 'DIRECT' only if the 'enseigne' field was set
//         (which was almost never the case → 0 direct charges).
// After: allocationMethod is 'DIRECT' if the category is a direct charge
//        (achats matières premières, emballages, transport sur ventes,
//         études & prestations, achats de matériel) OR if enseigne is set.
//
// Run with:
//   DATABASE_URL='postgresql://postgres.uefoknteptnbefgauwhr:VENTEKOOKS2026@aws-0-eu-west-1.pooler.supabase.com:5432/postgres' \
//   npx -y tsx scripts/migrate_allocation_method.ts
import { PrismaClient } from '@prisma/client';
import { isChargeDirecte } from '../src/lib/compte-comptable';

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL! } },
});

async function main() {
  const charges = await db.charge.findMany({
    select: { id: true, category: true, enseigne: true, allocationMethod: true },
  });

  console.log(`[INFO] ${charges.length} charges à analyser`);

  let directCount = 0;
  let globalCount = 0;
  let changedCount = 0;

  // Build the update batches
  const directIds: string[] = [];
  const globalIds: string[] = [];

  for (const c of charges) {
    const shouldBeDirect = !!(c.enseigne) || isChargeDirecte(c.category);
    if (shouldBeDirect && c.allocationMethod !== 'DIRECT') {
      directIds.push(c.id);
      changedCount++;
    } else if (!shouldBeDirect && c.allocationMethod !== 'GLOBAL') {
      globalIds.push(c.id);
      changedCount++;
    }
    if (shouldBeDirect) directCount++;
    else globalCount++;
  }

  console.log(`\n[INFO] Répartition après migration intelligente:`);
  console.log(`  DIRECT: ${directCount} charges (${((directCount / charges.length) * 100).toFixed(1)}%)`);
  console.log(`  GLOBAL: ${globalCount} charges (${((globalCount / charges.length) * 100).toFixed(1)}%)`);
  console.log(`  À modifier: ${changedCount} charges`);

  // Update in batches
  const BATCH = 200;
  for (let i = 0; i < directIds.length; i += BATCH) {
    const batch = directIds.slice(i, i + BATCH);
    const r = await db.charge.updateMany({
      where: { id: { in: batch } },
      data: { allocationMethod: 'DIRECT' },
    });
    console.log(`  Batch DIRECT ${i / BATCH + 1}: ${r.count} mis à jour`);
  }
  for (let i = 0; i < globalIds.length; i += BATCH) {
    const batch = globalIds.slice(i, i + BATCH);
    const r = await db.charge.updateMany({
      where: { id: { in: batch } },
      data: { allocationMethod: 'GLOBAL' },
    });
    console.log(`  Batch GLOBAL ${i / BATCH + 1}: ${r.count} mis à jour`);
  }

  // Summary by category
  const allCharges = await db.charge.findMany({
    select: { category: true, allocationMethod: true, amountHT: true },
  });
  const byCat = new Map<string, { direct: number; global: number; total: number }>();
  for (const c of allCharges) {
    const cur = byCat.get(c.category) ?? { direct: 0, global: 0, total: 0 };
    cur.total += c.amountHT;
    if (c.allocationMethod === 'DIRECT') cur.direct += c.amountHT;
    else cur.global += c.amountHT;
    byCat.set(c.category, cur);
  }

  console.log('\n=== Répartition par catégorie (top 15) ===');
  const sorted = Array.from(byCat.entries()).sort((a, b) => b[1].total - a[1].total);
  for (const [cat, d] of sorted.slice(0, 15)) {
    const pct = d.total > 0 ? (d.direct / d.total) * 100 : 0;
    console.log(`  ${cat}: ${formatEuro(d.total)} → ${formatEuro(d.direct)} direct (${pct.toFixed(0)}%) + ${formatEuro(d.global)} global`);
  }

  const totalDirect = allCharges.filter(c => c.allocationMethod === 'DIRECT').reduce((s, c) => s + c.amountHT, 0);
  const totalGlobal = allCharges.filter(c => c.allocationMethod === 'GLOBAL').reduce((s, c) => s + c.amountHT, 0);
  const totalAll = totalDirect + totalGlobal;
  console.log(`\n=== TOTAL ===`);
  console.log(`  Charges directes:   ${formatEuro(totalDirect)} (${((totalDirect / totalAll) * 100).toFixed(1)}%)`);
  console.log(`  Charges indirectes: ${formatEuro(totalGlobal)} (${((totalGlobal / totalAll) * 100).toFixed(1)}%)`);
  console.log(`  Total:              ${formatEuro(totalAll)}`);

  await db.$disconnect();
  console.log('\n[FINI] Migration terminée');
}

function formatEuro(n: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

main().catch((e) => {
  console.error('[ERREUR]', e);
  process.exit(1);
});
