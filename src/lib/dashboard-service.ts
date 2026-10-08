// Fonctions utilitaires de calcul pour le tableau de bord de suivi
import { db } from '@/lib/db';
import type {
  AgentStat,
  AgentPeriodTotal,
  CustomerFollowup,
  DashboardData,
  EnseigneStat,
  EnseignePeriodStat,
  KpiData,
  MonthlyStat,
  SaleRow,
} from './dashboard-types';

const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];
export { MONTH_NAMES };

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

// Formate une date ISO (YYYY-MM-DD) ou objet Date en JJ/MM/AAAA
// Exemple : "2026-09-30" → "30/09/2026"
export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '—';
  // Si c'est déjà au format ISO YYYY-MM-DD
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (match) {
    const [, year, month, day] = match;
    return `${day}/${month}/${year}`;
  }
  // Sinon essaie de parser comme Date
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
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

// Récupère toutes les périodes disponibles (années + mois) - optionnellement filtrées par agent
async function getAvailablePeriods(agentFilter?: string | null): Promise<{ year: number; months: number[] }[]> {
  const where = agentFilter ? { agent: agentFilter } : {};
  const rows = await db.sale.findMany({
    where,
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

// Calcule les KPIs pour une période donnée - optionnellement filtrés par agent
async function computeKpis(year: number, month: number, agentFilter?: string | null): Promise<KpiData> {
  const where = agentFilter ? { year, month, agent: agentFilter } : { year, month };
  const sales = await db.sale.findMany({
    where,
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
  const prevWhere = agentFilter ? { year: prev.year, month: prev.month, agent: agentFilter } : { year: prev.year, month: prev.month };
  const prevSales = await db.sale.findMany({
    where: prevWhere,
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

// Série mensuelle pour graphique d'évolution - optionnellement filtrée par agent
async function computeMonthlySeries(agentFilter?: string | null): Promise<MonthlyStat[]> {
  const where = agentFilter ? { agent: agentFilter } : {};
  const rows = await db.sale.findMany({
    where,
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

// Statistiques par agent pour une période donnée (non filtrée par agent)
async function computeAgentStats(year: number, month: number, _agentFilter?: string | null): Promise<AgentStat[]> {
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

// Statistiques par enseigne pour une période donnée - optionnellement filtrées par agent
async function computeEnseigneStats(year: number, month: number, agentFilter?: string | null): Promise<EnseigneStat[]> {
  const where = agentFilter ? { year, month, agent: agentFilter } : { year, month };
  const sales = await db.sale.findMany({
    where,
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
      prixVenteMoyen: s.nbBl > 0 ? s.caHT / s.nbBl : 0, // CA / nbBL = prix de vente moyen observé
      lastOrder: s.lastOrder ? s.lastOrder.toISOString().split('T')[0] : null,
    }))
    .sort((a, b) => b.caHT - a.caHT);
}

// Suivi de fidélisation clients - sur toute la période disponible - optionnellement filtré par agent
async function computeCustomerFollowup(
  currentYear: number,
  currentMonth: number,
  agentFilter?: string | null
): Promise<CustomerFollowup[]> {
  // Récupère toutes les ventes groupées par enseigne
  const where = agentFilter ? { agent: agentFilter } : {};
  const sales = await db.sale.findMany({
    where,
    select: {
      enseigne: true, type: true, agent: true,
      amountHT: true, date: true,
    },
    orderBy: { date: 'asc' },
  });

  // Récupère la liste des enseignes inactives (intégrées dans une SCA, etc.)
  // pour ne pas les afficher dans le suivi de relance
  const inactiveEnseignes = await db.enseigne.findMany({
    where: { isActive: false },
    select: { name: true },
  });
  const inactiveNames = new Set(inactiveEnseignes.map((e) => e.name));

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

  // Calcule "jours depuis dernière commande" par rapport à aujourd'hui
  // Règle Kooks : délai de prise de commande = 1 mois (30 jours)
  //   0-30 jours = OK
  //   31-90 jours = À RELANCER
  //   >90 jours = INACTIF
  const nowReal = new Date(); // date réelle aujourd'hui
  return Array.from(byEnseigne.values())
    .filter((s) => !inactiveNames.has(s.enseigne)) // exclut les enseignes inactives (intégrées dans SCA)
    .map((s) => {
      const last = s.lastOrder ? new Date(s.lastOrder) : null;
      const first = s.firstOrder ? new Date(s.firstOrder) : null;
      const daysSinceLast = last
        ? Math.floor((nowReal.getTime() - last.getTime()) / (1000 * 60 * 60 * 24))
        : 9999;
      // monthsSinceLast gardé pour compatibilité ascendante
      const monthsSinceLast = last
        ? (nowReal.getFullYear() - last.getFullYear()) * 12 +
          (nowReal.getMonth() - last.getMonth())
        : 999;
      // Récurrence = nb de mois avec commande / nb de mois total depuis 1ère commande
      let totalMonthsActive = 1;
      if (first && last) {
        totalMonthsActive =
          (last.getFullYear() - first.getFullYear()) * 12 +
          (last.getMonth() - first.getMonth()) + 1;
      }
      const recurrence = totalMonthsActive > 0 ? s.dates.size / totalMonthsActive : 0;

      // Les Centrale (coopératives : SCAOUEST, SCACHAP, ALDOUEST, OTERA, SCAPEST...)
      // ne sont jamais considérées comme inactives : ce sont des structures
      // qui peuvent ne pas commander pendant plusieurs mois sans pour autant
      // être "perdues" — elles reviennent toujours.
      const isCooperative = ['otera','scapest','scachap','scaouest','aldouest',
        'centra approvi','cooperative approvisionnement','societe cooperative dapprovi'
      ].some((p) => s.enseigne.toLowerCase().includes(p));

      let status: 'OK' | 'A RELANCER' | 'INACTIF';
      if (isCooperative) {
        // Jamais "INACTIF" pour les coopératives — ce sont des structures récurrentes
        status = daysSinceLast <= 90 ? 'OK' : 'A RELANCER';
      } else {
        if (daysSinceLast <= 30) status = 'OK';
        else if (daysSinceLast <= 90) status = 'A RELANCER';
        else status = 'INACTIF';
      }

      return {
        enseigne: s.enseigne,
        type: s.type,
        agent: s.agent,
        nbBlTotal: s.nbBlTotal,
        caTotal: s.caTotal,
        lastOrder: last ? last.toISOString().split('T')[0] : null,
        monthsSinceLastOrder: monthsSinceLast,
        daysSinceLastOrder: daysSinceLast,
        recurrence,
        status,
      };
    })
    .sort((a, b) => b.caTotal - a.caTotal);
}

// Récupère l'ensemble des ventes pour une période (pour table détaillée) - optionnellement filtrées par agent
export async function getSales(year: number, month: number, agentFilter?: string | null): Promise<SaleRow[]> {
  const where = agentFilter ? { year, month, agent: agentFilter } : { year, month };
  const sales = await db.sale.findMany({
    where,
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

// Performance des agents sur TOUTE la période (pas seulement le mois sélectionné)
// Non filtrée par agent (pour comparer tous les agents entre eux)
async function computeAgentPeriodTotals(): Promise<AgentPeriodTotal[]> {
  const sales = await db.sale.findMany({
    select: {
      agent: true, type: true, amountHT: true, commission: true, date: true, enseigne: true,
    },
    orderBy: { date: 'asc' },
  });

  // Récupère aussi les volumes par enseigne (pour les attribuer aux agents)
  const volumes = await db.volumeSale.findMany({
    select: { enseigne: true, quantity: true, format: true },
  });
  const FORMAT_POTS: Record<string, number> = { 'Lot de 2': 12, 'Indiv Fouro': 8, 'Indiv PAV 8': 8, 'Box de 9': 36 };
  // Map enseigne → total colis + total pots
  const volByEnseigne = new Map<string, { colis: number; pots: number }>();
  for (const v of volumes) {
    const e = volByEnseigne.get(v.enseigne) ?? { colis: 0, pots: 0 };
    e.colis += v.quantity;
    e.pots += v.quantity * (v.format ? (FORMAT_POTS[v.format] ?? 1) : 1);
    volByEnseigne.set(v.enseigne, e);
  }
  // Map agent → enseignes (depuis les ventes)
  const agentEnseignes = new Map<string, Set<string>>();
  for (const r of sales) {
    if (!agentEnseignes.has(r.agent)) agentEnseignes.set(r.agent, new Set());
    agentEnseignes.get(r.agent)!.add(r.enseigne);
  }

  const totalCa = sales.reduce((s, r) => s + r.amountHT, 0);
  const byAgent = new Map<string, {
    agent: string;
    caHT: number; commission: number;
    nbBl: number; nbBlDirect: number; nbBlCentrale: number;
    caDirect: number; caCentrale: number;
    enseignes: Set<string>;
    firstOrder: Date | null; lastOrder: Date | null;
    totalColis: number; totalPots: number;
  }>();

  for (const r of sales) {
    const s = byAgent.get(r.agent) ?? {
      agent: r.agent,
      caHT: 0, commission: 0,
      nbBl: 0, nbBlDirect: 0, nbBlCentrale: 0,
      caDirect: 0, caCentrale: 0,
      enseignes: new Set<string>(),
      firstOrder: null as Date | null,
      lastOrder: null as Date | null,
      totalColis: 0, totalPots: 0,
    };
    s.caHT += r.amountHT;
    s.commission += r.commission;
    s.nbBl += 1;
    s.enseignes.add(r.enseigne);
    const d = new Date(r.date);
    if (!s.firstOrder || d < s.firstOrder) s.firstOrder = d;
    if (!s.lastOrder || d > s.lastOrder) s.lastOrder = d;
    if (r.type === 'Direct') {
      s.nbBlDirect += 1;
      s.caDirect += r.amountHT;
    } else {
      s.nbBlCentrale += 1;
      s.caCentrale += r.amountHT;
    }
    byAgent.set(r.agent, s);
  }

  // Attribue les volumes aux agents (basé sur les enseignes qu'ils couvrent)
  for (const [agent, enseignes] of agentEnseignes) {
    const s = byAgent.get(agent);
    if (!s) continue;
    for (const ens of enseignes) {
      const vol = volByEnseigne.get(ens);
      if (vol) {
        s.totalColis += vol.colis;
        s.totalPots += vol.pots;
      }
    }
  }

  return Array.from(byAgent.values())
    .map((s) => ({
      agent: s.agent,
      caHT: s.caHT,
      commission: s.commission,
      nbBl: s.nbBl,
      nbBlDirect: s.nbBlDirect,
      nbBlCentrale: s.nbBlCentrale,
      caDirect: s.caDirect,
      caCentrale: s.caCentrale,
      enseignesActives: s.enseignes.size,
      share: totalCa > 0 ? (s.caHT / totalCa) * 100 : 0,
      firstOrder: s.firstOrder ? s.firstOrder.toISOString().split('T')[0] : null,
      lastOrder: s.lastOrder ? s.lastOrder.toISOString().split('T')[0] : null,
      totalColis: s.totalColis,
      totalPots: s.totalPots,
    }))
    .sort((a, b) => b.caHT - a.caHT);
}

// Top enseignes sur TOUTE la période (pas seulement le mois sélectionné)
async function computeTopEnseignesPeriod(agentFilter?: string | null): Promise<EnseignePeriodStat[]> {
  const where = agentFilter ? { agent: agentFilter } : {};
  const sales = await db.sale.findMany({
    where,
    select: { enseigne: true, type: true, agent: true, amountHT: true, date: true },
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
    const d = new Date(r.date);
    if (!s.lastOrder || d > s.lastOrder) s.lastOrder = d;
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

// Charge l'intégralité du tableau de bord - optionnellement filtré par agent
export async function getDashboardData(
  year: number,
  month: number,
  agentFilter?: string | null
): Promise<DashboardData> {
  const [kpis, monthlySeries, agents, enseignes, customerFollowup, availablePeriods, agentPeriodTotals, topEnseignesPeriod] =
    await Promise.all([
      computeKpis(year, month, agentFilter),
      computeMonthlySeries(agentFilter),
      computeAgentStats(year, month, agentFilter),
      computeEnseigneStats(year, month, agentFilter),
      computeCustomerFollowup(year, month, agentFilter),
      getAvailablePeriods(agentFilter),
      computeAgentPeriodTotals(),
      computeTopEnseignesPeriod(agentFilter),
    ]);

  // Stats globales - filtrées par agent si agentFilter fourni
  const totalWhere = agentFilter ? { agent: agentFilter } : {};
  // Agrège par type pour avoir les totaux Direct/Centrale séparés
  const totalAgg = await db.sale.aggregate({
    where: totalWhere,
    _sum: { amountHT: true, commission: true },
    _count: true,
  });
  const directAgg = await db.sale.aggregate({
    where: { ...totalWhere, type: 'Direct' },
    _sum: { amountHT: true, commission: true },
    _count: true,
  });
  const centraleAgg = await db.sale.aggregate({
    where: { ...totalWhere, type: 'Centrale' },
    _sum: { amountHT: true, commission: true },
    _count: true,
  });
  const totalEnseignes = await db.enseigne.count();
  const dateRangeAgg = await db.sale.aggregate({
    where: totalWhere,
    _min: { date: true },
    _max: { date: true },
  });

  // Calcule les volumes globaux (colis + pots) depuis VolumeSale
  const FORMAT_POTS_MAP: Record<string, number> = { 'Lot de 2': 12, 'Indiv Fouro': 8, 'Indiv PAV 8': 8, 'Box de 9': 36 };
  const allVolumes = await db.volumeSale.findMany({
    select: { quantity: true, format: true },
  });
  let colisAgg = 0;
  let potsAgg = 0;
  for (const v of allVolumes) {
    colisAgg += v.quantity;
    potsAgg += v.quantity * (v.format ? (FORMAT_POTS_MAP[v.format] ?? 1) : 1);
  }

  return {
    kpis,
    monthlySeries,
    agents,
    agentPeriodTotals,
    enseignes,
    topEnseignesPeriod,
    customerFollowup,
    availablePeriods,
    currentPeriod: { year, month },
    agentFilter: agentFilter ?? null,
    global: {
      totalCaHT: totalAgg._sum.amountHT ?? 0,
      totalCommission: totalAgg._sum.commission ?? 0,
      totalNbBl: totalAgg._count,
      totalEnseignes,
      totalCaDirect: directAgg._sum.amountHT ?? 0,
      totalCaCentrale: centraleAgg._sum.amountHT ?? 0,
      totalBlDirect: directAgg._count,
      totalBlCentrale: centraleAgg._count,
      totalCommissionDirect: directAgg._sum.commission ?? 0,
      totalCommissionCentrale: centraleAgg._sum.commission ?? 0,
      totalColis: colisAgg ?? 0,
      totalPots: potsAgg ?? 0,
      dateRange: {
        start: dateRangeAgg._min.date ? dateRangeAgg._min.date.toISOString().split('T')[0] : null,
        end: dateRangeAgg._max.date ? dateRangeAgg._max.date.toISOString().split('T')[0] : null,
      },
    },
  };
}
