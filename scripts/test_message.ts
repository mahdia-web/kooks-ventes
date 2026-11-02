// Quick test of buildMessageText
import { buildMessageText } from '../src/components/message-summary';
import type { DashboardData } from '../src/lib/dashboard-types';

const mockData: DashboardData = {
  kpis: {
    current: {
      month: 10, year: 2026, label: 'Octobre 2026',
      caHT: 13970.50,
      caTTC: 14750.00,
      commission: 850.30,
      nbBl: 28,
      nbBlDirect: 22,
      nbBlCentrale: 6,
      caDirect: 9800.00,
      caCentrale: 4170.50,
      aovDirect: 445.45,
      aovCentrale: 695.08,
      aovGlobal: 498.95,
      partCaDirect: 0.701,
      partCaCentrale: 0.299,
      nbEnseignesActives: 14,
      enseignesActives: [],
    },
    previous: {
      month: 9, year: 2026, label: 'Septembre 2026',
      caHT: 12500.00, caTTC: 13200.00, commission: 750.00,
      nbBl: 25, caDirect: 8800.00, caCentrale: 3700.00,
    },
    evolution: {
      caHT: 1470.50, caHTPercent: 11.8,
      caDirectPercent: 11.4, caCentralePercent: 12.7,
      commission: 100.30, commissionPercent: 13.4,
      nbBl: 3, nbBlPercent: 12.0,
    },
  },
  monthlySeries: [],
  agents: [
    {
      agent: 'BROCARD',
      caHT: 5200.00, caTTC: 5500.00, commission: 320.00,
      nbBl: 12, nbBlDirect: 9, nbBlCentrale: 3,
      caDirect: 3800.00, caCentrale: 1400.00,
      aov: 433.33, share: 37.2, enseignesActives: 8,
    },
    {
      agent: 'CAP FRAIS',
      caHT: 6800.00, caTTC: 7200.00, commission: 420.00,
      nbBl: 14, nbBlDirect: 11, nbBlCentrale: 3,
      caDirect: 5000.00, caCentrale: 1800.00,
      aov: 485.71, share: 48.7, enseignesActives: 10,
    },
    {
      agent: "KOOK'S",
      caHT: 1970.50, caTTC: 2050.00, commission: 110.30,
      nbBl: 2, nbBlDirect: 2, nbBlCentrale: 0,
      caDirect: 1000.00, caCentrale: 970.50,
      aov: 985.25, share: 14.1, enseignesActives: 2,
    },
  ],
  agentPeriodTotals: [],
  enseignes: [
    { enseigne: 'SCACHAP', type: 'Centrale', agent: 'BROCARD', caHT: 800.00, nbBl: 1, share: 5.7, lastOrder: '2026-10-15', prixVenteMoyen: 800 },
    { enseigne: 'OTERA SAS', type: 'Centrale', agent: 'BROCARD', caHT: 600.00, nbBl: 2, share: 4.3, lastOrder: '2026-10-12', prixVenteMoyen: 300 },
    { enseigne: 'SCAOUEST', type: 'Centrale', agent: 'CAP FRAIS', caHT: 1200.00, nbBl: 2, share: 8.6, lastOrder: '2026-10-18', prixVenteMoyen: 600 },
    { enseigne: 'ALDOUEST', type: 'Centrale', agent: 'CAP FRAIS', caHT: 600.00, nbBl: 1, share: 4.3, lastOrder: '2026-10-10', prixVenteMoyen: 600 },
    { enseigne: 'MONOPRIX PARIS', type: 'Direct', agent: 'BROCARD', caHT: 1200.00, nbBl: 3, share: 8.6, lastOrder: '2026-10-20', prixVenteMoyen: 400 },
    { enseigne: 'AUCHAN SEMECOURT', type: 'Direct', agent: 'CAP FRAIS', caHT: 1800.00, nbBl: 4, share: 12.9, lastOrder: '2026-10-22', prixVenteMoyen: 450 },
  ],
  topEnseignesPeriod: [],
  customerFollowup: [],
  availablePeriods: [],
  currentPeriod: { year: 2026, month: 10 },
  global: {
    totalCaHT: 13970.50, totalCommission: 850.30, totalNbBl: 28, totalEnseignes: 14,
    totalCaDirect: 9800.00, totalCaCentrale: 4170.50,
    totalBlDirect: 22, totalBlCentrale: 6,
    totalCommissionDirect: 686.00, totalCommissionCentrale: 208.50,
    totalColis: 0, totalPots: 0,
    dateRange: { start: '2026-10-01', end: '2026-10-31' },
  },
};

console.log('=== MESSAGE GLOBAL ===\n');
console.log(buildMessageText(mockData, null));
console.log('\n\n=== MESSAGE BROCARD ===\n');
console.log(buildMessageText(mockData, 'BROCARD'));
console.log('\n\n=== MESSAGE CAP FRAIS ===\n');
console.log(buildMessageText(mockData, 'CAP FRAIS'));
console.log('\n\n=== MESSAGE KOOK\'S ===\n');
console.log(buildMessageText(mockData, "KOOK'S"));
