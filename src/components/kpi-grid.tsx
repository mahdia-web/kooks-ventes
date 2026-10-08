'use client';

import { Card, CardContent } from '@/components/ui/card';
import {
  TrendingUp,
  TrendingDown,
  Euro,
  ShoppingCart,
  Percent,
  Users,
  Building2,
  Store,
  Layers,
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
  agentFilter?: string;
}

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
  evolution?: { value: number; percent: number; suffix?: string };
  iconBg: string;
}

// Palette Kooks — couleurs contrastées Direct vs Centrale
// Direct = cobalt bleu, Centrale = orange (très distincts visuellement)
const ICONS = {
  orange: 'bg-primary/20 text-primary',
  blue: 'bg-[#3674b5]/15 text-[#3674b5]',     // Direct
  red: 'bg-destructive/15 text-destructive',
  mint: 'bg-secondary/40 text-secondary-foreground',
  caramel: 'bg-[#bb7e40]/15 text-[#bb7e40]',
  yellow: 'bg-[#ffe111]/30 text-[#7a6500]',
  slate: 'bg-muted text-muted-foreground',
};

function KpiCard({ icon, label, value, subtitle, evolution, iconBg }: KpiCardProps) {
  return (
    <Card className="border-border overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {label}
            </p>
            <p className="text-xl font-title font-bold text-foreground truncate">
              {value}
            </p>
            {subtitle && (
              <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
            )}
          </div>
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
            {icon}
          </div>
        </div>
        {evolution && (
          <div className="mt-2 flex items-center gap-1 text-xs">
            {evolution.percent >= 0 ? (
              <TrendingUp className="h-3.5 w-3.5 text-primary" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-destructive" />
            )}
            <span
              className={
                evolution.percent >= 0
                  ? 'text-primary font-medium'
                  : 'text-destructive font-medium'
              }
            >
              {formatPercent(evolution.percent)}
            </span>
            <span className="text-muted-foreground">vs mois préc.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function KpiGrid({ kpis, agentFilter = 'all' }: KpiGridProps) {
  const c = kpis.current;
  const e = kpis.evolution;
  const prevLabel = kpis.previous ? shortMonth(kpis.previous.month) : '';
  const isAgentFiltered = agentFilter !== 'all';

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {/* === CA Total === */}
      <KpiCard
        icon={<Euro className="h-4 w-4" />}
        label={isAgentFiltered ? `CA HT — ${agentFilter}` : 'CA Total HT'}
        value={formatEuro(c.caHT)}
        subtitle={`vs ${prevLabel}: ${formatEuro(kpis.previous?.caHT ?? 0)}`}
        evolution={{ value: e.caHT, percent: e.caHTPercent }}
        iconBg={ICONS.orange}
      />

      {/* === CA Direct === */}
      <KpiCard
        icon={<Euro className="h-4 w-4" />}
        label="CA Direct (7%)"
        value={formatEuro(c.caDirect)}
        subtitle={`${(c.partCaDirect * 100).toFixed(0)}% du CA total`}
        iconBg={ICONS.blue}
      />

      {/* === CA Centrale === */}
      <KpiCard
        icon={<Euro className="h-4 w-4" />}
        label="CA Centrale (5%)"
        value={formatEuro(c.caCentrale)}
        subtitle={`${(c.partCaCentrale * 100).toFixed(0)}% du CA total`}
        iconBg={ICONS.orange}
      />

      {/* === Commission === */}
      <KpiCard
        icon={<Percent className="h-4 w-4" />}
        label="Commission"
        value={formatEuro(c.commission)}
        subtitle={`vs ${prevLabel}: ${formatEuro(kpis.previous?.commission ?? 0)}`}
        evolution={{ value: e.commission, percent: e.commissionPercent }}
        iconBg={ICONS.red}
      />

      {/* === BL Total === */}
      <KpiCard
        icon={<ShoppingCart className="h-4 w-4" />}
        label="BL Total"
        value={formatNumber(c.nbBl)}
        subtitle={`vs ${prevLabel}: ${formatNumber(kpis.previous?.nbBl ?? 0)}`}
        evolution={{ value: e.nbBl, percent: e.nbBlPercent }}
        iconBg={ICONS.mint}
      />

      {/* === BL Direct + BL Centrale === */}
      <KpiCard
        icon={<Layers className="h-4 w-4" />}
        label="BL Direct / Centrale"
        value={`${formatNumber(c.nbBlDirect)} / ${formatNumber(c.nbBlCentrale)}`}
        subtitle={`Direct: ${(c.nbBl ? (c.nbBlDirect / c.nbBl) * 100 : 0).toFixed(0)}% • Centrale: ${(c.nbBl ? (c.nbBlCentrale / c.nbBl) * 100 : 0).toFixed(0)}%`}
        iconBg={ICONS.yellow}
      />

      {/* === Enseignes actives === */}
      <KpiCard
        icon={<Building2 className="h-4 w-4" />}
        label={isAgentFiltered ? `Enseignes actives — ${agentFilter}` : 'Enseignes actives'}
        value={formatNumber(c.nbEnseignesActives)}
        subtitle={`Panier moy. : ${formatEuro(c.aovGlobal)}`}
        iconBg={ICONS.slate}
      />

      {/* === Panier moyen Direct/Centrale === */}
      <KpiCard
        icon={<Store className="h-4 w-4" />}
        label="Panier moyen Direct/Centrale"
        value={formatEuro(c.aovGlobal)}
        subtitle={`Direct: ${formatEuro(c.aovDirect)} • Centrale: ${formatEuro(c.aovCentrale)}`}
        iconBg={ICONS.slate}
      />
    </div>
  );
}
