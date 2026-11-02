// Fix: normalize all sale enseigne names to match enseigne table
// This fixes "clients à relancer" showing wrong last-order dates
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL! } } });

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`]/g, '').replace(/\s+/g, ' ').trim();
}

async function main() {
  console.log('=== Normalisation des noms d\'enseigne dans Sale ===\n');

  // 1. Get all enseigne names from Enseigne table
  const enseignes = await db.enseigne.findMany({ select: { name: true } });
  const ensNames = new Set(enseignes.map(e => e.name));
  const ensNormMap = new Map<string, string>(); // normalized → original
  for (const e of enseignes) {
    ensNormMap.set(norm(e.name), e.name);
  }

  // 2. Get all distinct enseigne names from Sale table
  const saleNames = await db.sale.findMany({
    select: { enseigne: true },
    distinct: ['enseigne'],
  });

  let totalFixed = 0;
  let totalSalesUpdated = 0;

  for (const s of saleNames) {
    const saleName = s.enseigne;
    if (ensNames.has(saleName)) continue; // Already matches

    // Try to find a match by normalized name
    const saleNorm = norm(saleName);

    // Strategy 1: exact normalized match
    let match = ensNormMap.get(saleNorm);

    // Strategy 2: the sale name contains or is contained in an enseigne name
    if (!match) {
      for (const [en, orig] of ensNormMap) {
        if (en === saleNorm || en.includes(saleNorm) || saleNorm.includes(en)) {
          match = orig;
          break;
        }
      }
    }

    // Strategy 3: OTERA special case — merge SAS OTERA X → O'TERA X if exists
    if (!match && saleNorm.includes('otera')) {
      for (const [en, orig] of ensNormMap) {
        if (en.includes('otera') && en.includes(saleNorm.replace(/sas\s+/g, '').replace(/otera\s+/, ''))) {
          match = orig;
          break;
        }
      }
    }

    if (!match) continue;

    // Update all sales with this enseigne name to the canonical name
    const count = await db.sale.count({ where: { enseigne: saleName } });
    console.log(`  "${saleName}" → "${match}" (${count} ventes)`);
    const r = await db.sale.updateMany({
      where: { enseigne: saleName },
      data: { enseigne: match },
    });
    totalSalesUpdated += r.count;
    totalFixed++;
  }

  console.log(`\n=== Résumé ===`);
  console.log(`  Noms normalisés: ${totalFixed}`);
  console.log(`  Ventes mises à jour: ${totalSalesUpdated}`);

  // Verify: check OTERA specifically
  console.log('\n=== Vérification OTERA ===');
  const oteraSales = await db.sale.findMany({
    where: { enseigne: { contains: 'OTERA', mode: 'insensitive' } },
    select: { enseigne: true },
    distinct: ['enseigne'],
  });
  for (const s of oteraSales) {
    const exists = ensNames.has(s.enseigne) || ensNormMap.get(norm(s.enseigne));
    const count = await db.sale.count({ where: { enseigne: s.enseigne } });
    const latest = await db.sale.findFirst({
      where: { enseigne: s.enseigne },
      orderBy: { date: 'desc' },
      select: { date: true },
    });
    const status = exists ? '✓' : '✗ NOT IN ENSEIGNE';
    console.log(`  ${status} ${s.enseigne} (${count} ventes, dern=${latest?.date.toISOString().split('T')[0]})`);
  }

  await db.$disconnect();
  console.log('\n[FINI]');
}
main().catch(e => { console.error(e); process.exit(1); });
