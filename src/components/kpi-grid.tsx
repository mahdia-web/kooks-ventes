'use client';

import { Card, CardContent } from '@/components/ui/card';
import {
  TrendingUp,
  TrendingDown,
  Euro,
  ShoppingCart,
  Percent,
  Trophy,
  Users,
  Building2,
} from 'lucide-react';
import {
  formatEuro,
  formatNumber,
  formatPercent,
  shortMonth,
} from '@/lib/dashboard-service';
import type { KpiData } from '@/lib/dashboard-types';

interface KpiGridProps {
  kpis: KpiData;
}

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
  evolution?: { value: number; percent: number; suffix?: string };
  iconBg: string;
}

const ICONS = {
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400',
  rose: 'bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400',
  teal: 'bg-teal-50 text-teal-600 dark:bg-teal-950/30 dark:text-teal-400',
  violet: 'bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-400',
  sky: 'bg-sky-50 text-sky-600 dark:bg-sky-950/30 dark:text-sky-400',
  slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

function KpiCard({ icon, label, value, subtitle, evolution, iconBg }: KpiCardProps) {
  return (
    <Card className="border-slate-200 dark:border-slate-800 overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 min-w-0">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              {label}
            </p>
            <p className="text-xl font-bold text-slate-900 dark:text-white truncate">
              {value}
            </p>
            {subtitle && (
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {subtitle}
              </p>
            )}
          </div>
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
            {icon}
          </div>
        </div>
        {evolution && (
          <div className="mt-2 flex items-center gap-1 text-xs">
            {evolution.percent >= 0 ? (
              <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-rose-600" />
            )}
            <span
              className={
                evolution.percent >= 0
                  ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                  : 'text-rose-700 dark:text-rose-400 font-medium'
              }
            >
              {formatPercent(evolution.percent)}
            </span>
            <span className="text-slate-500 dark:text-slate-400">
              vs {subtitle?.includes('vs') ? '' : 'mois préc.'}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function KpiGrid({ kpis }: KpiGridProps) {
  const c = kpis.current;
  const e = kpis.evolution;
  const prevLabel = kpis.previous ? shortMonth(kpis.previous.month) : '';

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <KpiCard
        icon={<Euro className="h-4 w-4" />}
        label="Chiffre d'affaires HT"
        value={formatEuro(c.caHT)}
        subtitle={`vs ${prevLabel}: ${formatEuro(kpis.previous?.caHT ?? 0)}`}
        evolution={{ value: e.caHT, percent: e.caHTPercent }}
        iconBg={ICONS.emerald}
      />
      <KpiCard
        icon={<Percent className="h-4 w-4" />}
        label="Commission"
        value={formatEuro(c.commission)}
        subtitle={`vs ${prevLabel}: ${formatEuro(kpis.previous?.commission ?? 0)}`}
        evolution={{ value: e.commission, percent: e.commissionPercent }}
        iconBg={ICONS.teal}
      />
      <KpiCard
        icon={<ShoppingCart className="h-4 w-4" />}
        label="Nombre de BL"
        value={formatNumber(c.nbBl)}
        subtitle={`vs ${prevLabel}: ${formatNumber(kpis.previous?.nbBl ?? 0)}`}
        evolution={{ value: e.nbBl, percent: e.nbBlPercent }}
        iconBg={ICONS.sky}
      />
      <KpiCard
        icon={<Euro className="h-4 w-4" />}
        label="Panier moyen (AOV)"
        value={formatEuro(c.aovGlobal)}
        subtitle={`Direct: ${formatEuro(c.aovDirect)} • Centrale: ${formatEuro(c.aovCentrale)}`}
        iconBg={ICONS.violet}
      />
      <KpiCard
        icon={<Building2 className="h-4 w-4" />}
        label="Enseignes actives"
        value={formatNumber(c.nbEnseignesActives)}
        subtitle={`${formatEuro(c.caDirect)} Direct • ${formatEuro(c.caCentrale)} Centrale`}
        iconBg={ICONS.amber}
      />
      <KpiCard
        icon={<TrendingUp className="h-4 w-4" />}
        label="Part CA Direct"
        value={`${(c.partCaDirect * 100).toFixed(0)}%`}
        subtitle={`${c.nbBlDirect} BL direct • ${c.nbBlCentrale} BL centrale`}
        iconBg={ICONS.slate}
      />
    </div>
  );
}
