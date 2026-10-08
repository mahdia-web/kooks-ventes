'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Euro, ShoppingCart, Percent, TrendingUp } from 'lucide-react';
import { formatEuro, formatNumber, formatPercent, formatDate } from '@/lib/dashboard-service';
import type { DashboardData } from '@/lib/dashboard-types';

interface Props {
  data: DashboardData;
}

/**
 * Synthèse globale : lecture CA Direct vs Centrale sur toute la période.
 * Affiche les totaux et la part de chaque type.
 */
export function SyntheseGlobale({ data }: Props) {
  const g = data.global;
  const totalCa = g.totalCaHT || 0;
  const partDirect = totalCa > 0 ? (g.totalCaDirect / totalCa) : 0;
  const partCentrale = totalCa > 0 ? (g.totalCaCentrale / totalCa) : 0;
  const isAgentFiltered = !!data.agentFilter;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader>
        <CardTitle className="font-title flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Synthèse globale — CA Direct / Centrale
          {isAgentFiltered && (
            <span className="text-xs font-normal text-muted-foreground">
              ({data.agentFilter})
            </span>
          )}
        </CardTitle>
        <CardDescription>
          Lecture du CA total et de sa répartition sur toute la période disponible
          {g.dateRange.start && g.dateRange.end && (
            <>
              {' '}— du <strong>{formatDate(g.dateRange.start)}</strong> au <strong>{formatDate(g.dateRange.end)}</strong>
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Barre de répartition Direct/Centrale */}
        <div className="mb-4">
          <div className="flex h-6 rounded-md overflow-hidden border border-border">
            {partDirect > 0 && (
              <div
                className="bg-[#3674b5] flex items-center justify-center text-white text-xs font-medium"
                style={{ width: `${partDirect * 100}%` }}
                title={`Direct: ${formatEuro(g.totalCaDirect)}`}
              >
                {(partDirect * 100).toFixed(0)}%
              </div>
            )}
            {partCentrale > 0 && (
              <div
                className="bg-primary flex items-center justify-center text-primary-foreground text-xs font-medium"
                style={{ width: `${partCentrale * 100}%` }}
                title={`Centrale: ${formatEuro(g.totalCaCentrale)}`}
              >
                {(partCentrale * 100).toFixed(0)}%
              </div>
            )}
          </div>
        </div>

        {/* Cartes détaillées Direct / Centrale / Total */}
        <div className="grid gap-3 sm:grid-cols-3">
          {/* Total */}
          <div className="rounded-lg border border-border p-3 bg-card space-y-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Euro className="h-3.5 w-3.5" />
              CA Total HT
            </div>
            <div className="text-xl font-title font-bold text-foreground">
              {formatEuro(g.totalCaHT)}
            </div>
            <div className="text-xs text-muted-foreground">
              {formatNumber(g.totalNbBl)} BL • {formatEuro(g.totalCommission)} commission
            </div>
          </div>

          {/* Direct */}
          <div className="rounded-lg border border-[#3674b5]/30 p-3 bg-[#3674b5]/5 space-y-1">
            <div className="flex items-center gap-2 text-xs text-[#3674b5]">
              <ShoppingCart className="h-3.5 w-3.5" />
              Direct (7%)
            </div>
            <div className="text-xl font-title font-bold text-[#3674b5]">
              {formatEuro(g.totalCaDirect)}
            </div>
            <div className="text-xs text-muted-foreground">
              {formatNumber(g.totalBlDirect)} BL • {formatEuro(g.totalCommissionDirect)} commission
            </div>
          </div>

          {/* Centrale */}
          <div className="rounded-lg border border-primary/30 p-3 bg-primary/5 space-y-1">
            <div className="flex items-center gap-2 text-xs text-primary">
              <Percent className="h-3.5 w-3.5" />
              Centrale (5%)
            </div>
            <div className="text-xl font-title font-bold text-primary">
              {formatEuro(g.totalCaCentrale)}
            </div>
            <div className="text-xs text-muted-foreground">
              {formatNumber(g.totalBlCentrale)} BL • {formatEuro(g.totalCommissionCentrale)} commission
            </div>
          </div>
        </div>

        {/* Détails % */}
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Part CA Direct :</span>
            <span className="font-medium text-[#3674b5]">{formatPercent(partDirect)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Part CA Centrale :</span>
            <span className="font-medium text-primary">{formatPercent(partCentrale)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
