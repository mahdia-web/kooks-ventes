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
  '#059669', '#0d9488', '#0891b2', '#65a30d',
  '#ca8a04', '#dc2626', '#db2777', '#7c3aed',
];

function ChartTooltip({ active, payload, label, formatter }: any) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 shadow-md text-sm">
      <p className="font-medium mb-1 text-slate-900 dark:text-slate-100">{label}</p>
      {payload.map((entry: any, idx: number) => (
        <p key={idx} className="text-slate-700 dark:text-slate-300">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm mr-2 align-middle"
            style={{ backgroundColor: entry.color || entry.fill }}
          />
          {formatter ? formatter(entry.value) : entry.value}
        </p>
      ))}
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
                />
                <Tooltip
                  content={<ChartTooltip formatter={(v: number) => formatEuro(v)} />}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  yAxisId="ca"
                  dataKey="caHT"
                  name="CA HT"
                  fill="#059669"
                  radius={[6, 6, 0, 0]}
                  barSize={28}
                />
                <Line
                  yAxisId="nb"
                  type="monotone"
                  dataKey="nbBl"
                  name="Nombre BL"
                  stroke="#0d9488"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#0d9488' }}
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
                      { name: 'Direct', value: kpis.current.caDirect, color: '#059669' },
                      { name: 'Centrale', value: kpis.current.caCentrale, color: '#0d9488' },
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
                      { name: 'Direct', value: kpis.current.caDirect, color: '#059669' },
                      { name: 'Centrale', value: kpis.current.caCentrale, color: '#0d9488' },
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
                  <Bar dataKey="caHT" fill="#059669" radius={[0, 6, 6, 0]} barSize={22} />
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
                  fill="#0d9488"
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

interface TopEnseignesProps {
  enseignes: EnseigneStat[];
}

export function TopEnseignesCard({ enseignes }: TopEnseignesProps) {
  const top = enseignes.slice(0, 15);
  if (top.length === 0) {
    return (
      <Card className="border-slate-200 dark:border-slate-800">
        <CardHeader>
          <CardTitle>Top enseignes du mois</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">Aucune vente ce mois.</p>
        </CardContent>
      </Card>
    );
  }
  const maxCa = top[0]?.caHT || 1;
  return (
    <Card className="border-slate-200 dark:border-slate-800">
      <CardHeader>
        <CardTitle>Top 15 enseignes du mois</CardTitle>
        <CardDescription>Par chiffre d'affaires HT</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
          {top.map((e, idx) => (
            <div key={e.enseigne} className="space-y-1">
              <div className="flex items-center justify-between text-sm gap-2">
                <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                  <span className="text-slate-400 mr-1.5">{idx + 1}.</span>
                  {e.enseigne}
                </span>
                <span className="text-slate-700 dark:text-slate-300 shrink-0 font-mono">
                  {formatEuro(e.caHT)}
                </span>
              </div>
              <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${(e.caHT / maxCa) * 100}%`,
                    backgroundColor: COLORS[idx % COLORS.length],
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
