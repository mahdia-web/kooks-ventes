// Seed initial : charge les données extraites du fichier SUIVI_AGENTS_FINAL_V2.xlsx
// dans la base SQLite via Prisma.
// Usage : bun run /home/z/my-project/scripts/seed-db.ts
import { db } from '../src/lib/db';
import data from './_seed_data.json';

interface EnseigneRow {
  name: string;
  type: string;
  agent: string;
}

interface VenteRow {
  blNumber: string;
  date: string;
  enseigne: string;
  type: string;
  agent: string;
  amountHT: number;
  amountTTC: number;
  rate: number;
  commission: number;
  month: number;
  year: number;
}

interface SeedData {
  enseignes: EnseigneRow[];
  ventes: VenteRow[];
  params: Record<string, string>;
}

const seed = data as SeedData;

async function main() {
  console.log('=== Début du seed ===');
  console.log(`  Enseignes à charger : ${seed.enseignes.length}`);
  console.log(`  Ventes à charger : ${seed.ventes.length}`);
  console.log(`  Paramètres : ${JSON.stringify(seed.params)}`);

  // 1. Upsert des enseignes
  console.log('\n--- Import des enseignes ---');
  let enseigneCount = 0;
  for (const e of seed.enseignes) {
    try {
      await db.enseigne.upsert({
        where: { name: e.name },
        update: { type: e.type, agent: e.agent },
        create: { name: e.name, type: e.type, agent: e.agent },
      });
      enseigneCount++;
    } catch (e2) {
      // Doublon : ignore
    }
  }
  console.log(`  ${enseigneCount} enseignes importées`);

  // 2. Upsert des ventes (détection de doublons par deduplicationKey)
  console.log('\n--- Import des ventes ---');
  let ventesCreated = 0;
  let ventesSkipped = 0;
  for (const v of seed.ventes) {
    // deduplicationKey = blNumber si présent, sinon hash
    const deduplicationKey = v.blNumber || `${v.date}|${v.enseigne}|${v.type}|${v.amountHT}`;
    try {
      await db.sale.create({
        data: {
          blNumber: v.blNumber || null,
          deduplicationKey,
          date: new Date(v.date),
          enseigne: v.enseigne,
          type: v.type,
          agent: v.agent,
          amountHT: v.amountHT,
          amountTTC: v.amountTTC,
          rate: v.rate,
          commission: v.commission,
          month: v.month,
          year: v.year,
        },
      });
      ventesCreated++;
    } catch (e) {
      ventesSkipped++;
    }
  }
  console.log(`  ${ventesCreated} ventes créées, ${ventesSkipped} déjà existantes`);

  // 3. Upsert des paramètres
  console.log('\n--- Import des paramètres ---');
  for (const [key, value] of Object.entries(seed.params)) {
    await db.parameter.upsert({
      where: { key },
      update: { value: String(value) },
      create: { key, value: String(value) },
    });
    console.log(`  ${key} = ${value}`);
  }

  // 4. Statistiques finales
  console.log('\n--- Statistiques finales ---');
  const totalVentes = await db.sale.count();
  const totalEnseignes = await db.enseigne.count();
  const totalParams = await db.parameter.count();
  console.log(`  Total ventes en base : ${totalVentes}`);
  console.log(`  Total enseignes en base : ${totalEnseignes}`);
  console.log(`  Total paramètres en base : ${totalParams}`);

  // Stats par année
  const stats = await db.sale.groupBy({
    by: ['year', 'month'],
    _count: true,
    _sum: { amountHT: true, commission: true },
    orderBy: [{ year: 'asc' }, { month: 'asc' }],
  });
  console.log('\n  Statistiques par mois :');
  for (const s of stats) {
    console.log(
      `    ${s.year}-${String(s.month).padStart(2, '0')}: ${s._count} ventes, CA HT = ${s._sum.amountHT?.toFixed(2)}€, commission = ${s._sum.commission?.toFixed(2)}€`
    );
  }

  console.log('\n=== Seed terminé ===');
}

main()
  .catch((e) => {
    console.error('Erreur lors du seed :', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
