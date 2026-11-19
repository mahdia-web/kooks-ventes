import { db } from '@/lib/db';

async function main() {
  const vs = await db.volumeSale.findMany({
    where: { OR: [{ enseigne: { contains: 'Costco', mode: 'insensitive' } }] },
    select: { enseigne: true, productLabel: true, parfum: true, format: true, quantity: true, unitPrice: true, date: true },
    take: 8,
    orderBy: { date: 'asc' },
  });
  console.log('=== VolumeSale Costco (sample) ===');
  for (const v of vs) {
    console.log(`${v.enseigne} | ${v.productLabel} | qty=${v.quantity} | unit=${v.unitPrice} | date=${v.date.toISOString().slice(0,10)}`);
  }

  // Format Box de 9 depuis DB
  const formats = await db.format.findMany({ select: { name: true, potsPerColis: true, potsPerFormat: true, unitesFormatPerColis: true } });
  console.log('\n=== Formats en base ===');
  for (const f of formats) console.log(`${f.name}: potsPerColis=${f.potsPerColis}, potsPerFormat=${f.potsPerFormat}, unitesFormatPerColis=${f.unitesFormatPerColis}`);

  // CA par parfum×format pour Costco (Box de 9)
  const box9 = vs.filter(v => /box.*9|box de 9/i.test(v.format || '') || /BOX 9/i.test(v.productLabel));
  console.log('\n=== Box de 9 chez Costco ===');
  let totalQty = 0, totalCA = 0;
  for (const v of box9) { totalQty += v.quantity; totalCA += (v.quantity * (v.unitPrice ?? 0)); console.log(`  qty=${v.quantity} unit=${v.unitPrice} → CA=${(v.quantity*(v.unitPrice??0)).toFixed(2)}`); }
  console.log(`  TOTAL: qty=${totalQty} CA=${totalCA.toFixed(2)} → unit moy = ${(totalCA/totalQty).toFixed(4)}`);
  console.log(`  CA/qty/9 = ${(totalCA/totalQty/9).toFixed(4)} €/pot`);
  console.log(`  CA/qty/36 = ${(totalCA/totalQty/36).toFixed(4)} €/pot`);

  await db.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
