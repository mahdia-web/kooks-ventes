// Comprehensive fix: merge ALL enseigne name variants in Sale table
// that should be the same store (OTERA, etc.)
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL! } } });

function norm(s: string): string {
  let n = s.toUpperCase().trim();
  n = n.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  n = n.replace(/[''`]/g, '');
  n = n.replace(/[-_.,()]/g, ' ');
  n = n.replace(/^(SARL\s+)+(SAS|SA|SARL|EURL|SASU)\s+/g, '');
  n = n.replace(/^(SAS|SA|SARL|EURL|SASU)\s+/g, '');
  n = n.replace(/\s+/g, ' ').trim();
  return n;
}

async function main() {
  console.log('=== Fusion comprehensive des variantes de noms ===\n');

  const enseignes = await db.enseigne.findMany({ select: { id: true, name: true } });
  const ensByNorm = new Map<string, string>(); // normalized → canonical name
  for (const e of enseignes) {
    const n = norm(e.name);
    if (!ensByNorm.has(n)) ensByNorm.set(n, e.name);
  }

  const saleNames = await db.sale.findMany({
    select: { enseigne: true },
    distinct: ['enseigne'],
  });

  let totalFixed = 0;
  let totalSalesUpdated = 0;
  const unmatched: string[] = [];

  for (const s of saleNames) {
    const saleName = s.enseigne;
    if (ensByNorm.has(norm(saleName)) && ensByNorm.get(norm(saleName)) === saleName) continue;

    const saleNorm = norm(saleName);

    // Strategy 1: exact normalized match
    let match = ensByNorm.get(saleNorm);

    // Strategy 2: sale name normalized is a substring of enseigne normalized or vice versa
    if (!match) {
      let bestMatch = null;
      let bestScore = 0;
      for (const [en, orig] of ensByNorm) {
        if (en === saleNorm) { match = orig; break; }
        // Check if one contains the other
        if (en.includes(saleNorm) || saleNorm.includes(en)) {
          const score = Math.min(en.length, saleNorm.length) / Math.max(en.length, saleNorm.length);
          if (score > bestScore) { bestScore = score; bestMatch = orig; }
        }
        // Check word-level Jaccard similarity
        const w1 = new Set(saleNorm.split(' '));
        const w2 = new Set(en.split(' '));
        let inter = 0;
        for (const w of w1) if (w2.has(w)) inter++;
        const union = w1.size + w2.size - inter;
        const jaccard = union > 0 ? inter / union : 0;
        if (jaccard > 0.7 && jaccard > bestScore) { bestScore = jaccard; bestMatch = orig; }
      }
      match = match ?? bestMatch;
    }

    if (!match) {
      unmatched.push(saleName);
      continue;
    }

    const count = await db.sale.count({ where: { enseigne: saleName } });
    if (saleName !== match) {
      console.log(`  "${saleName}" → "${match}" (${count} ventes)`);
      const r = await db.sale.updateMany({
        where: { enseigne: saleName },
        data: { enseigne: match },
      });
      totalSalesUpdated += r.count;
      totalFixed++;
    }
  }

  console.log(`\n=== Résumé ===`);
  console.log(`  Noms normalisés: ${totalFixed}`);
  console.log(`  Ventes mises à jour: ${totalSalesUpdated}`);
  console.log(`  Non matchés: ${unmatched.length}`);

  // Delete orphaned enseignes (no sales left)
  const allEns = await db.enseigne.findMany({ select: { id: true, name: true } });
  let deleted = 0;
  for (const e of allEns) {
    const count = await db.sale.count({ where: { enseigne: e.name } });
    if (count === 0) {
      console.log(`  Suppression enseigne orpheline: "${e.name}"`);
      await db.enseigne.delete({ where: { id: e.id } });
      deleted++;
    }
  }
  console.log(`  Enseignes orphelines supprimées: ${deleted}`);

  // Final verification: OTERA
  console.log('\n=== OTERA final ===');
  const oteraSales = await db.sale.findMany({
    where: { enseigne: { contains: 'OTERA', mode: 'insensitive' } },
    select: { enseigne: true },
    distinct: ['enseigne'],
  });
  for (const s of oteraSales) {
    const count = await db.sale.count({ where: { enseigne: s.enseigne } });
    const latest = await db.sale.findFirst({
      where: { enseigne: s.enseigne },
      orderBy: { date: 'desc' },
      select: { date: true },
    });
    console.log(`  ${s.enseigne} (${count} ventes, dern=${latest?.date.toISOString().split('T')[0]})`);
  }

  await db.$disconnect();
  console.log('\n[FINI]');
}
main().catch(e => { console.error(e); process.exit(1); });
