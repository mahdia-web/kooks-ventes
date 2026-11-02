// Fix: re-apply CHR type + merge OTERA duplicates + verify
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL! } } });

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[''`]/g, '').trim();
}

async function main() {
  // === 1. CHR type ===
  console.log('=== 1. Type CHR ===\n');
  const chrKeywords = [
    'steakhouse', 'tiliz', 'restaurant', 'bistro', 'brasserie',
    'traiteur', 'hotel', 'cafe', 'cafe', 'hostellerie', 'hotellerie',
    'glace', 'gelato', 'bouchon', 'auberge', 'taverne', 'gastro',
    'maison de la glace', 'pere & fish', 'pere  fish', 'chuck',
  ];

  const allEns = await db.enseigne.findMany();
  let chrCount = 0;
  for (const e of allEns) {
    const n = norm(e.name);
    const isChr = chrKeywords.some(kw => n.includes(norm(kw)));
    if (isChr && e.type !== 'CHR') {
      console.log(`  ${e.type} → CHR: "${e.name}"`);
      await db.enseigne.update({ where: { id: e.id }, data: { type: 'CHR' } });
      const r = await db.$executeRaw`
        UPDATE "Sale" SET type = 'CHR', rate = 0, commission = 0
        WHERE enseigne = ${e.name}
      `;
      console.log(`    ${r} ventes mises à jour`);
      chrCount++;
    }
  }
  console.log(`\n  Total CHR: ${chrCount}`);

  // === 2. OTERA merge ===
  console.log('\n=== 2. Fusion OTERA ===\n');

  const oteraCanonical: Record<string, string> = {
    'amiens': 'SAS OTERA AMIENS',
    'aulnoy': 'SAS OTERA AULNOY',
    'nice': 'SAS OTERA NICE',
    'sainte eulalie': 'SAS OTERA SAINTE EULALIE',
    'brest': "O'TERA BREST",
    'epagny': "O'TERA EPAGNY",
    'illies': "O'TERA ILLIES",
    'merignac': "O'TERA MERIGNAC",
    'wasquehal': "O'TERA Wasquehal",
    'avelin': "SAS O'TERA D'AVELIN",
    'du sart': "SAS O'TERA DU SART - VILLENEUVE D'ASCQ",
    'jb lebas': "O'TERA - JB LEBAS",
    'arras': "O'TERA - ARRAS",
  };

  const oteraEns = await db.enseigne.findMany({
    where: { name: { contains: 'OTERA', mode: 'insensitive' } },
  });

  // Group by location
  const groups = new Map<string, typeof oteraEns>();
  for (const e of oteraEns) {
    const n = norm(e.name);
    let location = '';
    for (const [loc, canon] of Object.entries(oteraCanonical)) {
      if (n.includes(loc)) { location = canon; break; }
    }
    if (!location) location = e.name; // standalone
    if (!groups.has(location)) groups.set(location, []);
    groups.get(location)!.push(e);
  }

  let mergedCount = 0;
  let salesUpdated = 0;
  for (const [canonical, variants] of groups) {
    if (variants.length <= 1) continue;
    // Keep the canonical one, merge others
    const keep = variants.find(e => e.name === canonical) ?? variants[0];
    const dups = variants.filter(e => e.id !== keep.id);
    console.log(`  "${keep.name}" (${variants.length} variants)`);
    for (const dup of dups) {
      console.log(`    ← "${dup.name}"`);
      const r = await db.sale.updateMany({
        where: { enseigne: dup.name },
        data: { enseigne: keep.name },
      });
      console.log(`      ${r.count} ventes`);
      salesUpdated += r.count;
      await db.enseigne.delete({ where: { id: dup.id } });
      mergedCount++;
    }
  }
  console.log(`\n  Total: ${mergedCount} doublons fusionnés, ${salesUpdated} ventes`);

  // === 3. Summary ===
  console.log('\n=== RÉSUMÉ ===');
  const final = await db.enseigne.findMany({ select: { type: true } });
  const counts = final.reduce((acc, e) => { acc[e.type] = (acc[e.type] ?? 0) + 1; return acc; }, {} as Record<string, number>);
  console.log(`  Types: ${JSON.stringify(counts)}`);

  const oteraFinal = await db.enseigne.findMany({
    where: { name: { contains: 'OTERA', mode: 'insensitive' } },
    select: { name: true, type: true },
  });
  console.log(`  OTERA restants: ${oteraFinal.length}`);
  for (const e of oteraFinal) {
    console.log(`    ${e.name} (${e.type})`);
  }

  await db.$disconnect();
  console.log('\n[FINI]');
}
main().catch(e => { console.error(e); process.exit(1); });
