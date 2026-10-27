// Initialise les agents CAP FRAIS et BROCARD dans la table Agent
// Détecte automatiquement les localisations OTERA dans les enseignes existantes
import { db } from '../src/lib/db';

const OTERA_LOCATIONS = [
  'amiens', 'aulnoy', 'arras', 'avelin', 'brest', 'epagny',
  'illies', 'merignac', 'nice', 'sart', 'st andré', 'st ande',
  'saint andré', 'saint ande', 'st eulalie', 'saint eulalie',
  'wasquehal', 'lille', 'le bas', 'lebas', 'jb lebas',
];

function detectOteraLocation(enseigneName: string): string | null {
  const normalized = enseigneName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`]/g, ''); // <-- sans espace : "O'TERA" → "otera"

  if (!normalized.includes('otera')) return null;

  // Cherche le nom de localisation après "otera"
  for (const loc of OTERA_LOCATIONS) {
    if (normalized.includes(loc)) {
      // Capitalise proprement
      return capitalizeLocation(loc);
    }
  }
  // Si on n'a pas trouvé, prend ce qui suit "otera" dans le nom
  const afterOtera = normalized.split('otera')[1]?.trim();
  if (afterOtera && afterOtera.length > 0 && afterOtera.length < 30) {
    return capitalizeLocation(afterOtera.split(' ').slice(0, 2).join(' '));
  }
  return 'Autre';
}

function capitalizeLocation(s: string): string {
  // Cas particuliers
  const lower = s.toLowerCase().trim();
  const specials: Record<string, string> = {
    'st andré': 'St André',
    'saint andré': 'St André',
    'st eulalie': 'St Eulalie',
    'saint eulalie': 'St Eulalie',
    'jb lebas': 'Lille JB Lebas',
    'lebas': 'Lille JB Lebas',
    'le bas': 'Lille JB Lebas',
  };
  if (specials[lower]) return specials[lower];
  // Capitalise la première lettre de chaque mot
  return s.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

async function main() {
  console.log('=== Initialisation agents + détection OTERA ===');

  // 1. Crée les agents par défaut s'ils n'existent pas
  const defaultAgents = [
    { name: 'CAP FRAIS', defaultDirectRate: 0.07, defaultCentraleRate: 0.05, isActive: true },
    { name: 'BROCARD', defaultDirectRate: 0.07, defaultCentraleRate: 0.05, isActive: true },
  ];

  for (const a of defaultAgents) {
    await db.agent.upsert({
      where: { name: a.name },
      update: {},
      create: a,
    });
    console.log(`Agent "${a.name}" créé ou déjà existant`);
  }

  // 2. Pour chaque enseigne, détecte la localisation OTERA si applicable
  console.log('\n--- Détection OTERA ---');
  const enseignes = await db.enseigne.findMany();
  let updated = 0;
  let oteraCount = 0;

  for (const e of enseignes) {
    const location = detectOteraLocation(e.name);
    if (location) {
      oteraCount++;
      // Marque également le type Centrale pour les OTERA (s'ils ne l'étaient pas déjà)
      const newType = e.type === 'Centrale' ? e.type : 'Centrale';
      if (e.oteraLocation !== location || e.type !== newType) {
        await db.enseigne.update({
          where: { id: e.id },
          data: { oteraLocation: location, type: newType },
        });
        updated++;
      }
    }
  }
  console.log(`${oteraCount} enseignes OTERA détectées`);
  console.log(`${updated} enseignes mises à jour`);

  // Affiche les OTERA par localisation
  console.log('\n--- OTERA par localisation ---');
  const oteraEnseignes = await db.enseigne.findMany({
    where: { oteraLocation: { not: null } },
    orderBy: { oteraLocation: 'asc' },
  });
  const byLocation = new Map<string, string[]>();
  for (const e of oteraEnseignes) {
    if (!e.oteraLocation) continue;
    if (!byLocation.has(e.oteraLocation)) byLocation.set(e.oteraLocation, []);
    byLocation.get(e.oteraLocation)!.push(e.name);
  }
  for (const [loc, names] of byLocation) {
    console.log(`  ${loc} (${names.length}): ${names.join(', ')}`);
  }

  console.log('\n=== Terminé ===');
}

main()
  .catch((e) => {
    console.error('Erreur:', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
