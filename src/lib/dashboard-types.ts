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
}

export interface CustomerFollowup {
  enseigne: string;
  type: string;
  agent: string;
  nbBlTotal: number;
  caTotal: number;
  lastOrder: string | null;
  monthsSinceLastOrder: number;
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

export interface DashboardData {
  kpis: KpiData;
  monthlySeries: MonthlyStat[];
  agents: AgentStat[];
  enseignes: EnseigneStat[];
  customerFollowup: CustomerFollowup[];
  availablePeriods: { year: number; months: number[] }[];
  currentPeriod: { year: number; month: number };
  global: {
    totalCaHT: number;
    totalCommission: number;
    totalNbBl: number;
    totalEnseignes: number;
    dateRange: { start: string | null; end: string | null };
  };
}

export interface ImportResult {
  inserted: number;
  skipped: number;
  errors: string[];
  total: number;
}
