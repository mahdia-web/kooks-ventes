import { db } from '@/lib/db';


async function main() {
  const targets = ['CARREFOUR BELGIUM', 'COSTCO FRANCE', 'BERINGEN', 'PONTAULT COMBAULT'];
  for (const t of targets) {
    const enseignes = await db.enseigne.findMany({
      where: { name: { contains: t, mode: 'insensitive' } },
      select: { id: true, name: true, type: true, agent: true },
    });
    console.log(`\n=== Enseigne "${t}" → ${enseignes.length} result(s) ===`);
    for (const e of enseignes) {
      console.log(`  [${e.id}] type=${e.type || '(null)'} agent=${e.agent || '(null)'} name=${e.name}`);
    }
  }

  console.log('\n=== Sales BERINGEN (top 8) ===');
  const s1 = await db.sale.findMany({
    where: { enseigne: { contains: 'BERINGEN', mode: 'insensitive' } },
    select: { enseigne: true, type: true, agent: true, amountHT: true, date: true },
    take: 8,
    orderBy: { date: 'desc' },
  });
  for (const s of s1) {
    console.log(`  ${s.date.toISOString().slice(0,10)} type=${s.type} agent=${s.agent} CA=${s.amountHT} enseigne=${s.enseigne}`);
  }

  console.log('\n=== Sales PONTAULT (top 8) ===');
  const s2 = await db.sale.findMany({
    where: { enseigne: { contains: 'PONTAULT', mode: 'insensitive' } },
    select: { enseigne: true, type: true, agent: true, amountHT: true, date: true },
    take: 8,
    orderBy: { date: 'desc' },
  });
  for (const s of s2) {
    console.log(`  ${s.date.toISOString().slice(0,10)} type=${s.type} agent=${s.agent} CA=${s.amountHT} enseigne=${s.enseigne}`);
  }

  console.log('\n=== Sales COSTCO (top 8) ===');
  const s3 = await db.sale.findMany({
    where: { enseigne: { contains: 'COSTCO', mode: 'insensitive' } },
    select: { enseigne: true, type: true, agent: true, amountHT: true, date: true },
    take: 8,
    orderBy: { date: 'desc' },
  });
  for (const s of s3) {
    console.log(`  ${s.date.toISOString().slice(0,10)} type=${s.type} agent=${s.agent} CA=${s.amountHT} enseigne=${s.enseigne}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
