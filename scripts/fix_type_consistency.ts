// Fix type inconsistencies — optimized with batch SQL updates
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL! } } });

const CENTRALE_KW = [
  'otera','scapest','scachap','scaouest','aldouest',
  'centra approvi','cooperative approvisionnement','societe cooperative dapprovi',
  'scapnor','scadif','scapaest','scapdr',
  'cooperative u ensei','cooperative u ensie',
  'carrefour supply chain',
];
function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[''`]/g, '').trim();
}
function shouldBeCentrale(name: string): boolean {
  const n = norm(name);
  if (CENTRALE_KW.some(kw => n.includes(kw))) return true;
  if (n.includes('cooperative') && (n.includes('approvi') || n.includes('u ensei') || n.includes('u ensie'))) return true;
  return false;
}

async function main() {
  console.log('=== Correction type Direct/Centrale ===\n');
  const agents = await db.agent.findMany();
  const agentRates = new Map(agents.map(a => [a.name, { d: a.defaultDirectRate, c: a.defaultCentraleRate }]));

  // Get enseignes that need fixing
  const enseignes = await db.enseigne.findMany({ select: { id: true, name: true, type: true, agent: true } });
  const toFix = enseignes.filter(e => {
    const correct = shouldBeCentrale(e.name) ? 'Centrale' : 'Direct';
    return correct !== e.type;
  });

  console.log(`Enseignes à corriger: ${toFix.length} sur ${enseignes.length}`);

  let updatedSales = 0;
  for (const ens of toFix) {
    const correctType = shouldBeCentrale(ens.name) ? 'Centrale' : 'Direct';
    const rateMap = agentRates.get(ens.agent);
    const newRate = correctType === 'Centrale' ? (rateMap?.c ?? 0.05) : (rateMap?.d ?? 0.07);

    console.log(`  ${ens.type} → ${correctType}: "${ens.name}" (rate=${newRate})`);

    // Batch update: type + rate + commission (commission = amountHT * newRate)
    const result = await db.$executeRaw`
      UPDATE "Sale"
      SET type = ${correctType},
          rate = ${newRate},
          commission = "amountHT" * ${newRate}
      WHERE enseigne = ${ens.name}
    `;
    console.log(`    ${result} ventes mises à jour`);
    updatedSales += result;

    // Update enseigne type
    await db.enseigne.update({ where: { id: ens.id }, data: { type: correctType } });
  }

  console.log(`\n=== Résumé ===`);
  console.log(`  Enseignes corrigées: ${toFix.length}`);
  console.log(`  Ventes mises à jour: ${updatedSales}`);

  // Final state
  const final = await db.enseigne.findMany({ select: { type: true } });
  const d = final.filter(e => e.type === 'Direct').length;
  const c = final.filter(e => e.type === 'Centrale').length;
  console.log(`\nDirect: ${d} | Centrale: ${c}`);

  await db.$disconnect();
  console.log('[FINI]');
}
main().catch(e => { console.error(e); process.exit(1); });
