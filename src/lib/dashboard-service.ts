// Fonctions utilitaires de calcul pour le tableau de bord de suivi
import { db } from '@/lib/db';
import type {
  AgentStat,
  CustomerFollowup,
  DashboardData,
  EnseigneStat,
  KpiData,
  MonthlyStat,
  SaleRow,
} from './dashboard-types';

const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

export function monthLabel(month: number): string {
  return MONTH_NAMES[month - 1] ?? `Mois ${month}`;
}

export function shortMonth(month: number): string {
  return monthLabel(month).slice(0, 3);
}

// Formate un nombre en euros
export function formatEuro(value: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('fr-FR').format(value);
}

export function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(1)}%`;
}

// Récupère la période courante depuis les paramètres de la base
export async function getCurrentPeriod(): Promise<{ year: number; month: number }> {
  const yearParam = await db.parameter.findUnique({ where: { key: 'currentYear' } });
  const monthParam = await db.parameter.findUnique({ where: { key: 'currentMonth' } });
  const year = yearParam ? parseInt(yearParam.value, 10) : new Date().getFullYear();
  const month = monthParam ? parseInt(monthParam.value, 10) : new Date().getMonth() + 1;
  return { year, month };
}

// Met à jour la période courante dans la base
export async function setCurrentPeriod(year: number, month: number): Promise<void> {
  await db.parameter.upsert({
    where: { key: 'currentYear' },
    update: { value: String(year) },
    create: { key: 'currentYear', value: String(year) },
  });
  await db.parameter.upsert({
    where: { key: 'currentMonth' },
    update: { value: String(month) },
    create: { key: 'currentMonth', value: String(month) },
  });
}

// Renvoie (year, month) du mois précédent
function previousMonth(year: number, month: number): { year: number; month: number } {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

// Récupère toutes les périodes disponibles (années + mois)
async function getAvailablePeriods(): Promise<{ year: number; months: number[] }[]> {
  const rows = await db.sale.findMany({
    select: { year: true, month: true },
    distinct: ['year', 'month'],
    orderBy: [{ year: 'asc' }, { month: 'asc' }],
  });
  const byYear = new Map<number, number[]>();
  for (const r of rows) {
    if (!byYear.has(r.year)) byYear.set(r.year, []);
    byYear.get(r.year)!.push(r.month);
  }
  return Array.from(byYear.entries()).map(([year, months]) => ({
    year,
    months: months.sort((a, b) => a - b),
  }));
}

// Calcule les KPIs pour une période donnée
async function computeKpis(year: number, month: number): Promise<KpiData> {
  const sales = await db.sale.findMany({
    where: { year, month },
    select: {
      amountHT: true,
      amountTTC: true,
      commission: true,
      type: true,
      enseigne: true,
    },
  });

  const caHT = sales.reduce((s, r) => s + r.amountHT, 0);
  const caTTC = sales.reduce((s, r) => s + r.amountTTC, 0);
  const commission = sales.reduce((s, r) => s + r.commission, 0);
  const nbBl = sales.length;
  const nbBlDirect = sales.filter((s) => s.type === 'Direct').length;
  const nbBlCentrale = sales.filter((s) => s.type === 'Centrale').length;
  const caDirect = sales.filter((s) => s.type === 'Direct').reduce((s, r) => s + r.amountHT, 0);
  const caCentrale = sales.filter((s) => s.type === 'Centrale').reduce((s, r) => s + r.amountHT, 0);
  const enseignesActives = Array.from(new Set(sales.map((s) => s.enseigne)));

  const prev = previousMonth(year, month);
  const prevSales = await db.sale.findMany({
    where: { year: prev.year, month: prev.month },
    select: { amountHT: true, amountTTC: true, commission: true },
  });

  const prevCaHT = prevSales.reduce((s, r) => s + r.amountHT, 0);
  const prevCommission = prevSales.reduce((s, r) => s + r.commission, 0);
  const prevNbBl = prevSales.length;

  const previous = prevSales.length > 0
    ? {
        ...prev,
        label: `${shortMonth(prev.month)} ${prev.year}`,
        caHT: prevCaHT,
        caTTC: prevSales.reduce((s, r) => s + r.amountTTC, 0),
        commission: prevCommission,
        nbBl: prevNbBl,
      }
    : null;

  const evolution = {
    caHT: caHT - prevCaHT,
    caHTPercent: prevCaHT > 0 ? (caHT - prevCaHT) / prevCaHT : 0,
    commission: commission - prevCommission,
    commissionPercent: prevCommission > 0 ? (commission - prevCommission) / prevCommission : 0,
    nbBl: nbBl - prevNbBl,
    nbBlPercent: prevNbBl > 0 ? (nbBl - prevNbBl) / prevNbBl : 0,
  };

  return {
    current: {
      month,
      year,
      label: `${monthLabel(month)} ${year}`,
      caHT,
      caTTC,
      commission,
      nbBl,
      nbBlDirect,
      nbBlCentrale,
      caDirect,
      caCentrale,
      aovDirect: nbBlDirect > 0 ? caDirect / nbBlDirect : 0,
      aovCentrale: nbBlCentrale > 0 ? caCentrale / nbBlCentrale : 0,
      aovGlobal: nbBl > 0 ? caHT / nbBl : 0,
      partCaDirect: caHT > 0 ? caDirect / caHT : 0,
      partCaCentrale: caHT > 0 ? caCentrale / caHT : 0,
      nbEnseignesActives: enseignesActives.length,
      enseignesActives,
    },
    previous,
    evolution,
  };
}

// Série mensuelle pour graphique d'évolution
async function computeMonthlySeries(): Promise<MonthlyStat[]> {
  const rows = await db.sale.findMany({
    select: {
      year: true, month: true, amountHT: true, amountTTC: true,
      commission: true, type: true,
    },
  });

  const byMonth = new Map<string, {
    year: number; month: number;
    caHT: number; caTTC: number; commission: number;
    nbBl: number; nbBlDirect: number; nbBlCentrale: number;
    caDirect: number; caCentrale: number;
  }>();

  for (const r of rows) {
    const key = `${r.year}-${r.month}`;
    const s = byMonth.get(key) ?? {
      year: r.year, month: r.month,
      caHT: 0, caTTC: 0, commission: 0,
      nbBl: 0, nbBlDirect: 0, nbBlCentrale: 0,
      caDirect: 0, caCentrale: 0,
    };
    s.caHT += r.amountHT;
    s.caTTC += r.amountTTC;
    s.commission += r.commission;
    s.nbBl += 1;
    if (r.type === 'Direct') {
      s.nbBlDirect += 1;
      s.caDirect += r.amountHT;
    } else {
      s.nbBlCentrale += 1;
      s.caCentrale += r.amountHT;
    }
    byMonth.set(key, s);
  }

  return Array.from(byMonth.values())
    .sort((a, b) => (a.year - b.year) || (a.month - b.month))
    .map((s) => ({
      ...s,
      label: `${shortMonth(s.month)} ${s.year}`,
      aovGlobal: s.nbBl > 0 ? s.caHT / s.nbBl : 0,
    }));
}

// Statistiques par agent pour une période donnée
async function computeAgentStats(year: number, month: number): Promise<AgentStat[]> {
  const sales = await db.sale.findMany({
    where: { year, month },
    select: {
      agent: true, amountHT: true, amountTTC: true,
      commission: true, type: true, enseigne: true,
    },
  });

  const totalCa = sales.reduce((s, r) => s + r.amountHT, 0);
  const byAgent = new Map<string, {
    agent: string;
    caHT: number; caTTC: number; commission: number;
    nbBl: number; nbBlDirect: number; nbBlCentrale: number;
    caDirect: number; caCentrale: number;
    enseignes: Set<string>;
  }>();

  for (const r of sales) {
    const s = byAgent.get(r.agent) ?? {
      agent: r.agent,
      caHT: 0, caTTC: 0, commission: 0,
      nbBl: 0, nbBlDirect: 0, nbBlCentrale: 0,
      caDirect: 0, caCentrale: 0,
      enseignes: new Set<string>(),
    };
    s.caHT += r.amountHT;
    s.caTTC += r.amountTTC;
    s.commission += r.commission;
    s.nbBl += 1;
    s.enseignes.add(r.enseigne);
    if (r.type === 'Direct') {
      s.nbBlDirect += 1;
      s.caDirect += r.amountHT;
    } else {
      s.nbBlCentrale += 1;
      s.caCentrale += r.amountHT;
    }
    byAgent.set(r.agent, s);
  }

  return Array.from(byAgent.values())
    .map((s) => ({
      agent: s.agent,
      caHT: s.caHT,
      caTTC: s.caTTC,
      commission: s.commission,
      nbBl: s.nbBl,
      nbBlDirect: s.nbBlDirect,
      nbBlCentrale: s.nbBlCentrale,
      caDirect: s.caDirect,
      caCentrale: s.caCentrale,
      aov: s.nbBl > 0 ? s.caHT / s.nbBl : 0,
      share: totalCa > 0 ? (s.caHT / totalCa) * 100 : 0,
      enseignesActives: s.enseignes.size,
    }))
    .sort((a, b) => b.caHT - a.caHT);
}

// Statistiques par enseigne pour une période donnée
async function computeEnseigneStats(year: number, month: number): Promise<EnseigneStat[]> {
  const sales = await db.sale.findMany({
    where: { year, month },
    select: {
      enseigne: true, type: true, agent: true,
      amountHT: true, date: true,
    },
    orderBy: { date: 'asc' },
  });

  const totalCa = sales.reduce((s, r) => s + r.amountHT, 0);
  const byEnseigne = new Map<string, {
    enseigne: string; type: string; agent: string;
    caHT: number; nbBl: number; lastOrder: Date | null;
  }>();

  for (const r of sales) {
    const s = byEnseigne.get(r.enseigne) ?? {
      enseigne: r.enseigne, type: r.type, agent: r.agent,
      caHT: 0, nbBl: 0, lastOrder: null as Date | null,
    };
    s.caHT += r.amountHT;
    s.nbBl += 1;
    if (!s.lastOrder || r.date > s.lastOrder) s.lastOrder = r.date;
    byEnseigne.set(r.enseigne, s);
  }

  return Array.from(byEnseigne.values())
    .map((s) => ({
      ...s,
      share: totalCa > 0 ? (s.caHT / totalCa) * 100 : 0,
      lastOrder: s.lastOrder ? s.lastOrder.toISOString().split('T')[0] : null,
    }))
    .sort((a, b) => b.caHT - a.caHT);
}

// Suivi de fidélisation clients - sur toute la période disponible
async function computeCustomerFollowup(
  currentYear: number,
  currentMonth: number
): Promise<CustomerFollowup[]> {
  // Récupère toutes les ventes groupées par enseigne
  const sales = await db.sale.findMany({
    select: {
      enseigne: true, type: true, agent: true,
      amountHT: true, date: true,
    },
    orderBy: { date: 'asc' },
  });

  const byEnseigne = new Map<string, {
    enseigne: string; type: string; agent: string;
    nbBlTotal: number; caTotal: number;
    lastOrder: Date | null; firstOrder: Date | null;
    dates: Set<string>; // YYYY-MM pour récurrence
  }>();

  for (const r of sales) {
    const s = byEnseigne.get(r.enseigne) ?? {
      enseigne: r.enseigne, type: r.type, agent: r.agent,
      nbBlTotal: 0, caTotal: 0,
      lastOrder: null as Date | null,
      firstOrder: null as Date | null,
      dates: new Set<string>(),
    };
    s.nbBlTotal += 1;
    s.caTotal += r.amountHT;
    const d = new Date(r.date);
    if (!s.lastOrder || d > s.lastOrder) s.lastOrder = d;
    if (!s.firstOrder || d < s.firstOrder) s.firstOrder = d;
    s.dates.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    byEnseigne.set(r.enseigne, s);
  }

  // Calcule "mois depuis dernière commande" par rapport au mois courant
  const now = new Date(currentYear, currentMonth - 1, 1);
  return Array.from(byEnseigne.values())
    .map((s) => {
      const last = s.lastOrder ? new Date(s.lastOrder) : null;
      const first = s.firstOrder ? new Date(s.firstOrder) : null;
      const monthsSinceLast = last
        ? (now.getFullYear() - last.getFullYear()) * 12 +
          (now.getMonth() - last.getMonth())
        : 999;
      // Récurrence = nb de mois avec commande / nb de mois total depuis 1ère commande
      let totalMonthsActive = 1;
      if (first && last) {
        totalMonthsActive =
          (last.getFullYear() - first.getFullYear()) * 12 +
          (last.getMonth() - first.getMonth()) + 1;
      }
      const recurrence = totalMonthsActive > 0 ? s.dates.size / totalMonthsActive : 0;

      let status: 'OK' | 'A RELANCER' | 'INACTIF';
      if (monthsSinceLast <= 1) status = 'OK';
      else if (monthsSinceLast <= 3) status = 'A RELANCER';
      else status = 'INACTIF';

      return {
        enseigne: s.enseigne,
        type: s.type,
        agent: s.agent,
        nbBlTotal: s.nbBlTotal,
        caTotal: s.caTotal,
        lastOrder: last ? last.toISOString().split('T')[0] : null,
        monthsSinceLastOrder: monthsSinceLast,
        recurrence,
        status,
      };
    })
    .sort((a, b) => b.caTotal - a.caTotal);
}

// Récupère l'ensemble des ventes pour une période (pour table détaillée)
export async function getSales(year: number, month: number): Promise<SaleRow[]> {
  const sales = await db.sale.findMany({
    where: { year, month },
    orderBy: { date: 'asc' },
  });
  return sales.map((s) => ({
    id: s.id,
    blNumber: s.blNumber,
    date: s.date.toISOString().split('T')[0],
    enseigne: s.enseigne,
    type: s.type,
    agent: s.agent,
    amountHT: s.amountHT,
    amountTTC: s.amountTTC,
    rate: s.rate,
    commission: s.commission,
    month: s.month,
    year: s.year,
  }));
}

// Charge l'intégralité du tableau de bord
export async function getDashboardData(year: number, month: number): Promise<DashboardData> {
  const [kpis, monthlySeries, agents, enseignes, customerFollowup, availablePeriods] =
    await Promise.all([
      computeKpis(year, month),
      computeMonthlySeries(),
      computeAgentStats(year, month),
      computeEnseigneStats(year, month),
      computeCustomerFollowup(year, month),
      getAvailablePeriods(),
    ]);

  // Stats globales
  const totalAgg = await db.sale.aggregate({
    _sum: { amountHT: true, commission: true },
    _count: true,
  });
  const totalEnseignes = await db.enseigne.count();
  const dateRangeAgg = await db.sale.aggregate({
    _min: { date: true },
    _max: { date: true },
  });

  return {
    kpis,
    monthlySeries,
    agents,
    enseignes,
    customerFollowup,
    availablePeriods,
    currentPeriod: { year, month },
    global: {
      totalCaHT: totalAgg._sum.amountHT ?? 0,
      totalCommission: totalAgg._sum.commission ?? 0,
      totalNbBl: totalAgg._count,
      totalEnseignes,
      dateRange: {
        start: dateRangeAgg._min.date ? dateRangeAgg._min.date.toISOString().split('T')[0] : null,
        end: dateRangeAgg._max.date ? dateRangeAgg._max.date.toISOString().split('T')[0] : null,
      },
    },
  };
}
