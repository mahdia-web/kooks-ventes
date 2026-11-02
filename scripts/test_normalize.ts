// Quick test of normalize-enseigne
import { normalizeEnseigne, similarityScore, resolveCanonicalName } from '../src/lib/normalize-enseigne';

const tests: Array<[string, string, string]> = [
  ['SCAPEST example 1', "SOCIETE COOPERATIVE D'APPROVISIONNEMENT PARIS-EST (CHALONS)", 'SCAPEST CHALONS'],
  ['SCAPEST example 2', "SOCIETE COOPERATIVE D'APPROVISIONNEMENT PARIS-EST (SCAPEST - CHALLON EN CHAMPAGNE)", 'SCAPEST CHALONS'],
  ['OTERA AMIENS short', "O'TERA AMIENS", 'OTERA AMIENS'],
  ['OTERA AMIENS prefix', "SAS O'TERA - AMIENS", 'OTERA AMIENS'],
  ['OTERA AMIENS sas', "SAS OTERA AMIENS", 'OTERA AMIENS'],
  ['SCAOUEST full', "SOCIETE COOPERATIVE D'APPROVISIONNEMENT DE L'OUEST", 'SCAOUEST'],
  ['MONOPRIX simple', 'MONOPRIX', 'MONOPRIX'],
  ['MONOPRIX ville', 'MONOPRIX PARIS 15', 'MONOPRIX PARIS 15'],
  ['MONOPRIX parens', 'MONOPRIX (PARIS 15)', 'MONOPRIX PARIS 15'],
  ['SCA Paris test', 'SCA PARIS', 'SCA PARIS'],
  ['SCA Paris 6216', 'SCA PARIS 6216', 'SCA PARIS 6216'],  // 6216 est dans le nom?
  ['LECLERC SCAOUEST blaindis', 'LECLERC SCAOUEST ( SAS BLAINDIS)', 'LECLERC SCAOUEST BLAINDIS'],
  ['STE EULALIE', 'SAINTE EULALIE', 'STE EULALIE'],
  // Additional cases
  ['S.C.A. PARIS dotted', 'S.C.A. PARIS', 'SCA PARIS'],
  ['SCA - PARIS dash', 'SCA - PARIS', 'SCA PARIS'],
  ['SAS SCA PARIS prefix', 'SAS SCA PARIS', 'SCA PARIS'],
  ['AUCHAN SEMECOURT', 'AUCHAN SEMECOURT', 'AUCHAN SEMECOURT'],
  ['AUCHAN SEMECOURT dash', 'AUCHAN - SEMECOURT', 'AUCHAN SEMECOURT'],
  ['COSTCO basic', 'COSTCO', 'COSTCO'],
  ['SCADIF full', "SOCIETE COOPERATIVE D'APPROVISIONNEMENT ILE DE FRANCE", 'SCADIF'],
  ['SCADIF short', 'SCADIF', 'SCADIF'],
];

console.log('=== TESTS NORMALIZATION ===\n');
for (const [label, input, expected] of tests) {
  const result = normalizeEnseigne(input);
  const ok = result === expected ? '✓' : '✗';
  console.log(`${ok} ${label}`);
  console.log(`  IN:  "${input}"`);
  console.log(`  OUT: "${result}"`);
  if (result !== expected) {
    console.log(`  EXPECTED: "${expected}"`);
  }
  console.log();
}

// Tests de similarité
console.log('=== TESTS SIMILARITY ===\n');
const simTests: Array<[string, string, string, number]> = [
  ['SCAPEST both', "SOCIETE COOPERATIVE D'APPROVISIONNEMENT PARIS-EST (CHALONS)", "SOCIETE COOPERATIVE D'APPROVISIONNEMENT PARIS-EST (SCAPEST - CHALLON EN CHAMPAGNE)", 0.9],
  ['MONOPRIX variants', 'MONOPRIX', 'MONOPRIX PARIS 15', 0.5],  // villes distinctes — faux positifs possibles
  ['OTERA diff cities', "SAS O'TERA AMIENS", "SAS O'TERA LYON", 0.5],  // magasins différents
  ['OTERA same city', "SAS O'TERA AMIENS", "OTERA AMIENS", 0.9],
];

for (const [label, a, b, minScore] of simTests) {
  const score = similarityScore(a, b);
  const ok = score >= minScore ? '✓' : '~';
  console.log(`${ok} ${label}: ${score.toFixed(3)} (min ${minScore})`);
  console.log(`  A: "${a}"`);
  console.log(`  B: "${b}"`);
  console.log();
}

// Tests de résolution canonique (import)
console.log('=== TESTS RESOLVE CANONICAL ===\n');
const existing = [
  'MONOPRIX',
  'AUCHAN SEMECOURT',
  "SAS O'TERA AMIENS",
  "SOCIETE COOPERATIVE D'APPROVISIONNEMENT PARIS-EST (CHALONS)",
  'SCA PARIS',
];
const incoming = [
  'monoprix',
  'MONOPRIX PARIS 15',
  'AUCHAN SEMECOURT',
  "SAS OTERA - AMIENS",
  "SOCIETE COOPERATIVE D'APPROVISIONNEMENT PARIS-EST (SCAPEST - CHALLON EN CHAMPAGNE)",
  'SCA Paris',
  'NOUVEAU CLIENT INCONNU',
];
for (const inc of incoming) {
  const r = resolveCanonicalName(inc, existing);
  console.log(`IN: "${inc}"`);
  console.log(`  → canonical: "${r.canonicalName}"`);
  console.log(`    matchedExisting: ${r.matchedExisting ? `"${r.matchedExisting}"` : '(null)'}`);
  console.log(`    confidence: ${r.confidence.toFixed(3)}`);
  console.log();
}
