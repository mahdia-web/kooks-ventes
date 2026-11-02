// Fix OTERA duplicates + add CHR type + fix type inconsistencies
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL! } } });

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[''`]/g, '').trim();
}

async function main() {
  console.log('=== 1. Fusion des doublons OTERA ===\n');

  // OTERA canonical mapping: normalize → canonical name
  const oteraMap: Record<string, string> = {
    'otera amiens': 'SAS OTERA AMIENS',
    'otera aulnoy': 'SAS OTERA AULNOY',
    'otera nice': 'SAS OTERA NICE',
    'otera sainte eulalie': 'SAS OTERA SAINTE EULALIE',
    'otera brest': "O'TERA BREST",
    'otera epagny': "O'TERA EPAGNY",
    'otera illies': "O'TERA ILLIES",
    'otera merignac': "O'TERA MERIGNAC",
    'otera wasquehal': "O'TERA Wasquehal",
    'otera avelin': "SAS O'TERA D'AVELIN",
    'otera du sart villeneuve': "SAS O'TERA DU SART - VILLENEUVE D'ASCQ",
    'otera jb lebas': "O'TERA - JB LEBAS",
    'otera arras': "O'TERA - ARRAS",
  };

  // Find all enseignes containing OTERA
  const oteraEnseignes = await db.enseigne.findMany({
    where: { name: { contains: 'OTERA', mode: 'insensitive' } },
  });
  console.log(`Found ${oteraEnseignes.length} OTERA enseignes`);

  // Group by normalized key
  const groups = new Map<string, { canonical: string; variants: typeof oteraEnseignes }>();
  for (const e of oteraEnseignes) {
    const n = norm(e.name);
    // Find which canonical it matches
    let canonical = e.name;
    for (const [key, canon] of Object.entries(oteraMap)) {
      if (n.includes(key)) {
        canonical = canon;
        break;
      }
    }
    if (!groups.has(canonical)) groups.set(canonical, { canonical, variants: [] });
    groups.get(canonical)!.variants.push(e);
  }

  let totalMerged = 0;
  let totalSalesUpdated = 0;

  for (const [canonical, group] of groups) {
    if (group.variants.length <= 1) continue;
    // Keep the one that matches the canonical name, merge others
    const keep = group.variants.find(e => e.name === canonical) ?? group.variants[0];
    const dups = group.variants.filter(e => e.id !== keep.id);
    console.log(`\n  Canonical: "${keep.name}" (${group.variants.length} variants)`);
    for (const dup of dups) {
      console.log(`    Merging: "${dup.name}"`);
      const r = await db.sale.updateMany({
        where: { enseigne: dup.name },
        data: { enseigne: keep.name },
      });
      console.log(`      ${r.count} ventes mises à jour`);
      totalSalesUpdated += r.count;
      await db.enseigne.delete({ where: { id: dup.id } });
      totalMerged++;
    }
  }
  console.log(`\n  Total: ${totalMerged} doublons fusionnés, ${totalSalesUpdated} ventes mises à jour`);

  // === 2. Add CHR type ===
  console.log('\n=== 2. Ajout du type CHR ===\n');

  // CHR keywords: restaurants, steakhouses, traiteurs, glaciers, etc.
  const chrKeywords = [
    'steakhouse', 'tiliz', 'restaurant', 'bistro', 'brasserie',
    'traiteur', 'hotel', 'cafe', 'café', 'hostellerie', 'hotellerie',
    'glace', 'gelato', 'bouchon', 'auberge', 'taverne', 'gastro',
    'maison de la glace',
  ];

  const allEnseignes = await db.enseigne.findMany();
  let chrCount = 0;
  for (const e of allEnseignes) {
    const n = norm(e.name);
    const isChr = chrKeywords.some(kw => n.includes(norm(kw)));
    if (isChr && e.type !== 'CHR') {
      console.log(`  ${e.type} → CHR: "${e.name}"`);
      // Update enseigne type
      await db.enseigne.update({ where: { id: e.id }, data: { type: 'CHR' } });
      // Update all sales for this enseigne to CHR type
      // CHR rate = 0% (KOOK'S direct sales, no commission)
      const r = await db.$executeRaw`
        UPDATE "Sale"
        SET type = 'CHR',
            rate = 0,
            commission = 0
        WHERE enseigne = ${e.name}
      `;
      console.log(`    ${r} ventes mises à jour (rate=0, commission=0)`);
      chrCount++;
    }
  }
  console.log(`\n  Total: ${chrCount} enseignes passées en CHR`);

  // === 3. Fix remaining type inconsistencies ===
  console.log('\n=== 3. Vérification types restants ===\n');

  const centraleKw = ['otera','scapest','scachap','scaouest','aldouest','centra approvi','cooperative approvisionnement','societe cooperative dapprovi','scapnor','scadif','scapaest','scapdr','carrefour supply chain'];
  const agents = await db.agent.findMany();
  const agentRates = new Map(agents.map(a => [a.name, { d: a.defaultDirectRate, c: a.defaultCentraleRate }]));

  let fixedCount = 0;
  for (const e of allEnseignes) {
    if (e.type === 'CHR') continue; // Skip CHR
    const n = norm(e.name);
    const shouldBeCentrale = centraleKw.some(kw => n.includes(kw));
    const correctType = shouldBeCentrale ? 'Centrale' : 'Direct';
    if (correctType !== e.type) {
      const rateMap = agentRates.get(e.agent);
      const newRate = correctType === 'Centrale' ? (rateMap?.c ?? 0.05) : (rateMap?.d ?? 0.07);
      console.log(`  ${e.type} → ${correctType}: "${e.name}"`);
      await db.$executeRaw`
        UPDATE "Sale"
        SET type = ${correctType},
            rate = ${newRate},
            commission = "amountHT" * ${newRate}
        WHERE enseigne = ${e.name}
      `;
      await db.enseigne.update({ where: { id: e.id }, data: { type: correctType } });
      fixedCount++;
    }
  }
  console.log(`\n  Total: ${fixedCount} types corrigés`);

  // === Summary ===
  console.log('\n=== RÉSUMÉ ===');
  const final = await db.enseigne.findMany({ select: { type: true } });
  const counts = final.reduce((acc, e) => { acc[e.type] = (acc[e.type] ?? 0) + 1; return acc; }, {} as Record<string, number>);
  console.log(`  Types: ${JSON.stringify(counts)}`);

  await db.$disconnect();
  console.log('\n[FINI]');
}
main().catch(e => { console.error(e); process.exit(1); });
