'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { TrendingUp, Building2, Store } from 'lucide-react';
import { formatEuro, formatNumber } from '@/lib/dashboard-service';
import type { MonthlyStat } from '@/lib/dashboard-types';

interface Props {
  monthlySeries: MonthlyStat[];
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-card border border-border rounded-md shadow-md p-2 text-sm">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: p.color }} />
            {p.name}:
          </span>
          <span className="font-medium">{formatEuro(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Onglet "Évolution CA" — affiche 2 graphs séparés :
 *   1. Évolution de CA en Centrale (orange, 5% commission)
 *   2. Évolution de CA en Direct (bleu cobalt, 7% commission)
 * Plus un tableau de synthèse mensuelle avec les deux côte à côte.
 */
export function EvolutionCaCentrale({ monthlySeries }: Props) {
  // Tri par ordre chronologique
  const sorted = [...monthlySeries].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });

  const chartData = sorted.map((s) => ({
    label: s.label,
    caCentrale: s.caCentrale,
    caDirect: s.caDirect,
    caTotal: s.caHT,
    nbBlCentrale: s.nbBlCentrale,
    nbBlDirect: s.nbBlDirect,
    nbBlTotal: s.nbBl,
  }));

  // Stats de synthèse
  const totalCentrale = sorted.reduce((s, r) => s + r.caCentrale, 0);
  const totalDirect = sorted.reduce((s, r) => s + r.caDirect, 0);
  const totalAll = totalCentrale + totalDirect;
  const partCentrale = totalAll > 0 ? (totalCentrale / totalAll) * 100 : 0;
  const partDirect = totalAll > 0 ? (totalDirect / totalAll) * 100 : 0;
  const monthsWithData = sorted.length;
  const avgCentralePerMonth = monthsWithData > 0 ? totalCentrale / monthsWithData : 0;
  const avgDirectPerMonth = monthsWithData > 0 ? totalDirect / monthsWithData : 0;

  return (
    <div className="space-y-4">
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-3">
          <div className="grid gap-3 sm:grid-cols-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground uppercase">Total CA Centrale (5%)</p>
              <p className="text-lg font-title font-bold text-primary">
                {formatEuro(totalCentrale)}
              </p>
              <p className="text-xs text-muted-foreground">
                {partCentrale.toFixed(1)}% du CA global • moy. {formatEuro(avgCentralePerMonth)}/mois
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">Total CA Direct (7%)</p>
              <p className="text-lg font-title font-bold text-[#3674b5]">
                {formatEuro(totalDirect)}
              </p>
              <p className="text-xs text-muted-foreground">
                {partDirect.toFixed(1)}% du CA global • moy. {formatEuro(avgDirectPerMonth)}/mois
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">CA Total ({monthsWithData} mois)</p>
              <p className="text-lg font-title font-bold text-foreground">
                {formatEuro(totalAll)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 1. Évolution de CA en Centrale */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="font-title flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Évolution de CA en Centrale
            </CardTitle>
            <CardDescription>
              CA mensuel Centrale (5% commission) — coopératives SCAOUEST, SCACHAP, etc.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Aucune donnée disponible sur la période.
              </p>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                    <defs>
                      <linearGradient id="colorCentrale" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f7a941" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#f7a941" stopOpacity={0.1} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e8d6a4" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#7a654a" />
                    <YAxis tick={{ fontSize: 10 }} stroke="#7a654a" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="caCentrale"
                      name="CA Centrale"
                      stroke="#f7a941"
                      fill="url(#colorCentrale)"
                      strokeWidth={2.5}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 2. Évolution de CA en Direct */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="font-title flex items-center gap-2">
              <Store className="h-5 w-5 text-[#3674b5]" />
              Évolution de CA en Direct
            </CardTitle>
            <CardDescription>
              CA mensuel Direct (7% commission) — ventes directes aux magasins
            </CardDescription>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Aucune donnée disponible sur la période.
              </p>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                    <defs>
                      <linearGradient id="colorDirect" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3674b5" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#3674b5" stopOpacity={0.1} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e8d6a4" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#7a654a" />
                    <YAxis tick={{ fontSize: 10 }} stroke="#7a654a" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="caDirect"
                      name="CA Direct"
                      stroke="#3674b5"
                      fill="url(#colorDirect)"
                      strokeWidth={2.5}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tableau de synthèse mensuelle */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="font-title">Détail mensuel — Centrale vs Direct</CardTitle>
          <CardDescription>
            Comparaison mois par mois du CA et du nombre de BL par type
          </CardDescription>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Aucune donnée disponible.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-2">Mois</th>
                    <th className="text-right p-2">CA Centrale</th>
                    <th className="text-right p-2">BL Centrale</th>
                    <th className="text-right p-2">CA Direct</th>
                    <th className="text-right p-2">BL Direct</th>
                    <th className="text-right p-2">CA Total</th>
                  </tr>
                </thead>
                <tbody>
                  {chartData.map((m) => (
                    <tr key={m.label} className="border-b border-border/50 hover:bg-muted/50">
                      <td className="p-2 font-medium">{m.label}</td>
                      <td className="p-2 text-right text-primary">{formatEuro(m.caCentrale)}</td>
                      <td className="p-2 text-right text-muted-foreground">{formatNumber(m.nbBlCentrale)}</td>
                      <td className="p-2 text-right text-[#3674b5]">{formatEuro(m.caDirect)}</td>
                      <td className="p-2 text-right text-muted-foreground">{formatNumber(m.nbBlDirect)}</td>
                      <td className="p-2 text-right font-semibold">{formatEuro(m.caTotal)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border font-semibold">
                    <td className="p-2">Totaux</td>
                    <td className="p-2 text-right text-primary">{formatEuro(totalCentrale)}</td>
                    <td className="p-2 text-right text-muted-foreground">
                      {formatNumber(chartData.reduce((s, m) => s + m.nbBlCentrale, 0))}
                    </td>
                    <td className="p-2 text-right text-[#3674b5]">{formatEuro(totalDirect)}</td>
                    <td className="p-2 text-right text-muted-foreground">
                      {formatNumber(chartData.reduce((s, m) => s + m.nbBlDirect, 0))}
                    </td>
                    <td className="p-2 text-right">{formatEuro(totalAll)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
