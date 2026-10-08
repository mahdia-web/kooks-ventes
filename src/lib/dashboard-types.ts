// Types partagés pour l'API du tableau de bord de suivi

export interface KpiData {
  current: {
    month: number;
    year: number;
    label: string;
    caHT: number;
    caTTC: number;
    commission: number;
    nbBl: number;
    nbBlDirect: number;
    nbBlCentrale: number;
    caDirect: number;
    caCentrale: number;
    aovDirect: number;
    aovCentrale: number;
    aovGlobal: number;
    partCaDirect: number;
    partCaCentrale: number;
    nbEnseignesActives: number;
    enseignesActives: string[];
  };
  previous: {
    month: number;
    year: number;
    label: string;
    caHT: number;
    caTTC: number;
    commission: number;
    nbBl: number;
  } | null;
  evolution: {
    caHT: number;
    caHTPercent: number;
    commission: number;
    commissionPercent: number;
    nbBl: number;
    nbBlPercent: number;
  };
}

export interface MonthlyStat {
  year: number;
  month: number;
  label: string;
  caHT: number;
  caTTC: number;
  commission: number;
  nbBl: number;
  nbBlDirect: number;
  nbBlCentrale: number;
  caDirect: number;
  caCentrale: number;
  aovGlobal: number;
}

export interface AgentStat {
  agent: string;
  caHT: number;
  caTTC: number;
  commission: number;
  nbBl: number;
  nbBlDirect: number;
  nbBlCentrale: number;
  caDirect: number;
  caCentrale: number;
  aov: number;
  share: number;
  enseignesActives: number;
}

export interface EnseigneStat {
  enseigne: string;
  type: string;
  agent: string;
  caHT: number;
  nbBl: number;
  share: number;
  lastOrder: string | null;
  prixVenteMoyen: number; // CA HT / nbBL — prix de vente moyen observé
}

export interface CustomerFollowup {
  enseigne: string;
  type: string;
  agent: string;
  nbBlTotal: number;
  caTotal: number;
  lastOrder: string | null;
  monthsSinceLastOrder: number;
  daysSinceLastOrder: number;
  recurrence: number;
  status: 'OK' | 'A RELANCER' | 'INACTIF';
}

export interface SaleRow {
  id: string;
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

// Performance d'un agent sur TOUTE la période (pas seulement le mois sélectionné)
export interface AgentPeriodTotal {
  agent: string;
  caHT: number;
  commission: number;
  nbBl: number;
  nbBlDirect: number;
  nbBlCentrale: number;
  caDirect: number;
  caCentrale: number;
  enseignesActives: number;
  share: number;
  firstOrder: string | null;
  lastOrder: string | null;
  totalColis: number;
  totalPots: number;
}

// Top enseigne sur TOUTE la période
export interface EnseignePeriodStat {
  enseigne: string;
  type: string;
  agent: string;
  caHT: number;
  nbBl: number;
  share: number;
  lastOrder: string | null;
}

export interface DashboardData {
  kpis: KpiData;
  monthlySeries: MonthlyStat[];
  agents: AgentStat[];              // Stats du mois sélectionné
  agentPeriodTotals: AgentPeriodTotal[];  // Stats sur TOUTE la période
  enseignes: EnseigneStat[];        // Top enseignes du mois
  topEnseignesPeriod: EnseignePeriodStat[]; // Top enseignes sur TOUTE la période
  customerFollowup: CustomerFollowup[];
  availablePeriods: { year: number; months: number[] }[];
  currentPeriod: { year: number; month: number };
  agentFilter?: string | null;
  global: {
    totalCaHT: number;
    totalCommission: number;
    totalNbBl: number;
    totalEnseignes: number;
    totalCaDirect: number;
    totalCaCentrale: number;
    totalBlDirect: number;
    totalBlCentrale: number;
    totalCommissionDirect: number;
    totalCommissionCentrale: number;
    totalColis: number;
    totalPots: number;
    dateRange: { start: string | null; end: string | null };
  };
}

export interface ImportResult {
  inserted: number;
  skipped: number;
  errors: string[];
  total: number;
}
