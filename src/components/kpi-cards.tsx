'use client';

import { Card, CardContent } from '@/components/ui/card';
import {
  Euro,
  Users,
  ShoppingCart,
  TrendingUp,
  Trophy,
  Package,
  Calendar,
} from 'lucide-react';
import { formatEuro, formatNumber } from '@/lib/analyzer';
import type { AnalysisResult } from '@/lib/types';

interface KpiCardsProps {
  result: AnalysisResult;
}

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
  accent: 'emerald' | 'sky' | 'amber' | 'violet' | 'rose' | 'teal';
}

const ACCENT_COLORS: Record<KpiCardProps['accent'], string> = {
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400',
  sky: 'bg-sky-50 text-sky-600 dark:bg-sky-950/30 dark:text-sky-400',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400',
  violet: 'bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-400',
  rose: 'bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400',
  teal: 'bg-teal-50 text-teal-600 dark:bg-teal-950/30 dark:text-teal-400',
};

function KpiCard({ icon, label, value, subtitle, accent }: KpiCardProps) {
  return (
    <Card className="overflow-hidden border-slate-200 dark:border-slate-800">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              {label}
            </p>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">
              {value}
            </p>
            {subtitle && (
              <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
            )}
          </div>
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${ACCENT_COLORS[accent]}`}
          >
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function KpiCards({ result }: KpiCardsProps) {
  const dateSubtitle =
    result.dateRange.start && result.dateRange.end
      ? `Du ${result.dateRange.start} au ${result.dateRange.end}`
      : 'Aucune date détectée';

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <KpiCard
        icon={<Euro className="h-5 w-5" />}
        label="Chiffre d'affaires total"
        value={formatEuro(result.totalAmount)}
        subtitle={`Moyenne : ${formatEuro(result.averageSale)}/vente`}
        accent="emerald"
      />
      <KpiCard
        icon={<ShoppingCart className="h-5 w-5" />}
        label="Nombre de ventes"
        value={formatNumber(result.totalSalesCount)}
        subtitle={`${formatNumber(result.totalQuantity)} unités vendues`}
        accent="sky"
      />
      <KpiCard
        icon={<Users className="h-5 w-5" />}
        label="Agents actifs"
        value={formatNumber(result.agents.length)}
        subtitle={`Top : ${result.topAgent?.agent ?? '—'}`}
        accent="violet"
      />
      <KpiCard
        icon={<Trophy className="h-5 w-5" />}
        label="Meilleur agent"
        value={result.topAgent?.agent ?? '—'}
        subtitle={result.topAgent ? formatEuro(result.topAgent.totalAmount) : '—'}
        accent="amber"
      />
      <KpiCard
        icon={<Package className="h-5 w-5" />}
        label="Produits vendus"
        value={formatNumber(result.products.length)}
        subtitle={`Top : ${result.topProduct?.product ?? '—'}`}
        accent="teal"
      />
      <KpiCard
        icon={<Calendar className="h-5 w-5" />}
        label="Période couverte"
        value={
          result.dateRange.start && result.dateRange.end
            ? `${result.dateRange.start.slice(0, 7)}`
            : '—'
        }
        subtitle={dateSubtitle}
        accent="rose"
      />
    </div>
  );
}
