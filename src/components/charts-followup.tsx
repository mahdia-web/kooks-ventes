'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  formatEuro,
  formatNumber,
  shortMonth,
} from '@/lib/dashboard-service';
import type { AgentStat, EnseigneStat, KpiData, MonthlyStat } from '@/lib/dashboard-types';

const COLORS = [
  '#3674b5', '#f7a941', '#bb7e40', '#a6d6c9',
  '#ca8a04', '#dc2626', '#db2777', '#7c3aed',
];

function ChartTooltip({ active, payload, label, formatter }: any) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-md text-sm">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((entry: any, idx: number) => {
        // Détection intelligente : si la clé contient "nb", "BL", "count", "nombre"
        // → afficher comme un nombre, sinon comme euro
        const dataKeyName = (entry.dataKey || entry.name || '').toLowerCase();
        const isCount = dataKeyName.includes('nb') || dataKeyName.includes('bl') || dataKeyName.includes('count') || dataKeyName.includes('nombre');
        const valueStr = isCount
          ? formatNumber(entry.value)
          : (formatter ? formatter(entry.value) : formatEuro(entry.value));
        return (
          <p key={idx} className="text-foreground">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm mr-2 align-middle"
              style={{ backgroundColor: entry.color || entry.fill }}
            />
            {entry.name}: <strong>{valueStr}</strong>
          </p>
        );
      })}
    </div>
  );
}

interface ChartsProps {
  kpis: KpiData;
  monthlySeries: MonthlyStat[];
  agents: AgentStat[];
  enseignes: EnseigneStat[];
}

export function ChartsGrid({ kpis, monthlySeries, agents, enseignes }: ChartsProps) {
  return (
    <div className="space-y-4">
      {/* Évolution mensuelle */}
      <Card className="border-slate-200 dark:border-slate-800">
        <CardHeader>
          <CardTitle>Évolution mensuelle</CardTitle>
          <CardDescription>
            Chiffre d'affaires HT et nombre de BL sur toute la période
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={monthlySeries}
                margin={{ top: 10, right: 10, left: 10, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis
                  yAxisId="ca"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickFormatter={(v) => formatNumber(Math.round(v / 1000)) + 'k'}
                />
                <YAxis
                  yAxisId="nb"
                  orientation="right"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickFormatter={(v) => formatNumber(v)}
                />
                <Tooltip
                  content={<ChartTooltip formatter={(v: number) => formatEuro(v)} />}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  yAxisId="ca"
                  dataKey="caHT"
                  name="CA HT"
                  fill="#3674b5"
                  radius={[6, 6, 0, 0]}
                  barSize={28}
                />
                <Line
                  yAxisId="nb"
                  type="monotone"
                  dataKey="nbBl"
                  name="Nombre BL"
                  stroke="#f7a941"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#f7a941' }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Répartition Direct/Centrale */}
        <Card className="border-slate-200 dark:border-slate-800">
          <CardHeader>
            <CardTitle>Répartition Direct vs Centrale</CardTitle>
            <CardDescription>Chiffre d'affaires HT par type</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Direct', value: kpis.current.caDirect, color: '#3674b5' },
                      { name: 'Centrale', value: kpis.current.caCentrale, color: '#f7a941' },
                    ]}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    innerRadius={45}
                    paddingAngle={2}
                  >
                    {[
                      { name: 'Direct', value: kpis.current.caDirect, color: '#3674b5' },
                      { name: 'Centrale', value: kpis.current.caCentrale, color: '#f7a941' },
                    ].map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={<ChartTooltip formatter={(v: number) => formatEuro(v)} />}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Top agents */}
        <Card className="border-slate-200 dark:border-slate-800">
          <CardHeader>
            <CardTitle>CA par agent</CardTitle>
            <CardDescription>Pour le mois sélectionné</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={agents}
                  layout="vertical"
                  margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickFormatter={(v) => formatNumber(Math.round(v / 1000)) + 'k'}
                  />
                  <YAxis
                    type="category"
                    dataKey="agent"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    width={110}
                  />
                  <Tooltip
                    content={<ChartTooltip formatter={(v: number) => formatEuro(v)} />}
                  />
                  <Bar dataKey="caHT" fill="#3674b5" radius={[0, 6, 6, 0]} barSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Évolution commission + AOV */}
      <Card className="border-slate-200 dark:border-slate-800">
        <CardHeader>
          <CardTitle>Évolution de la commission &amp; du panier moyen</CardTitle>
          <CardDescription>Commission mensuelle et AOV par mois</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={monthlySeries}
                margin={{ top: 10, right: 10, left: 10, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis
                  yAxisId="commission"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickFormatter={(v) => formatNumber(Math.round(v / 100)) + 'c€'}
                />
                <YAxis
                  yAxisId="aov"
                  orientation="right"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickFormatter={(v) => formatNumber(Math.round(v / 1000)) + 'k'}
                />
                <Tooltip
                  content={<ChartTooltip formatter={(v: number) => formatEuro(v)} />}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  yAxisId="commission"
                  dataKey="commission"
                  name="Commission"
                  fill="#f7a941"
                  radius={[6, 6, 0, 0]}
                  barSize={22}
                />
                <Line
                  yAxisId="aov"
                  type="monotone"
                  dataKey="aovGlobal"
                  name="AOV HT"
                  stroke="#dc2626"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#dc2626' }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
