'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatEuro, formatNumber } from '@/lib/analyzer';
import type { AnalysisResult } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ChartsProps {
  result: AnalysisResult;
}

// Palette cohérente (sans indigo/bleu dominant)
const COLORS = [
  '#059669', '#0d9488', '#0891b2', '#65a30d',
  '#ca8a04', '#dc2626', '#db2777', '#7c3aed',
  '#0f766e', '#4d7c0f', '#b45309', '#9333ea',
];

function ChartTooltipContent({ active, payload, label, formatter }: any) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 shadow-md">
      <p className="font-medium text-sm mb-1 text-slate-900 dark:text-slate-100">{label}</p>
      {payload.map((entry: any, idx: number) => (
        <p key={idx} className="text-sm text-slate-700 dark:text-slate-300">
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

export function SalesByAgentChart({ result }: ChartsProps) {
  const data = result.agents.slice(0, 15).map((a) => ({
    name: a.agent,
    amount: a.totalAmount,
    quantity: a.totalQuantity,
  }));

  if (data.length === 0) {
    return (
      <Card className="border-slate-200 dark:border-slate-800">
        <CardHeader>
          <CardTitle>Chiffre d'affaires par agent</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">Aucune donnée disponible.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200 dark:border-slate-800">
      <CardHeader>
        <CardTitle>Chiffre d'affaires par agent</CardTitle>
        <CardDescription>
          Top {data.length} des agents commerciaux par chiffre d'affaires
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="name"
                angle={-30}
                textAnchor="end"
                interval={0}
                height={70}
                tick={{ fontSize: 11, fill: '#64748b' }}
              />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => formatNumber(Math.round(v / 1000)) + 'k'} />
              <Tooltip content={<ChartTooltipContent formatter={(v: number) => formatEuro(v)} />} />
              <Bar dataKey="amount" fill="#059669" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function SalesByCategoryChart({ result }: ChartsProps) {
  const data = result.categories.slice(0, 8).map((c, idx) => ({
    name: c.category,
    value: c.totalAmount,
    color: COLORS[idx % COLORS.length],
  }));

  if (data.length === 0) {
    return (
      <Card className="border-slate-200 dark:border-slate-800">
        <CardHeader>
          <CardTitle>Répartition par catégorie</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">Aucune catégorie détectée.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200 dark:border-slate-800">
      <CardHeader>
        <CardTitle>Répartition par catégorie</CardTitle>
        <CardDescription>Part du chiffre d'affaires par famille</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={90}
                innerRadius={45}
                paddingAngle={2}
              >
                {data.map((entry, idx) => (
                  <Cell key={idx} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltipContent formatter={(v: number) => formatEuro(v)} />} />
              <Legend
                layout="horizontal"
                verticalAlign="bottom"
                align="center"
                wrapperStyle={{ fontSize: 11 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function SalesOverTimeChart({ result }: ChartsProps) {
  const data = result.timeSeries.map((t) => ({
    period: t.period,
    amount: t.amount,
    quantity: t.quantity,
  }));

  if (data.length === 0) {
    return (
      <Card className="border-slate-200 dark:border-slate-800">
        <CardHeader>
          <CardTitle>Évolution temporelle</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">
            Aucune date détectée. Mappez la colonne « Date » dans l'onglet Correspondance.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200 dark:border-slate-800">
      <CardHeader>
        <CardTitle>Évolution des ventes dans le temps</CardTitle>
        <CardDescription>Chiffre d'affaires et quantités par mois</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="period"
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickFormatter={(v) => v.slice(5)}
              />
              <YAxis
                yAxisId="amount"
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickFormatter={(v) => formatNumber(Math.round(v / 1000)) + 'k'}
              />
              <YAxis
                yAxisId="quantity"
                orientation="right"
                tick={{ fontSize: 11, fill: '#64748b' }}
              />
              <Tooltip content={<ChartTooltipContent formatter={(v: number) => formatEuro(v)} />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                yAxisId="amount"
                type="monotone"
                dataKey="amount"
                name="Chiffre d'affaires"
                stroke="#059669"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#059669' }}
              />
              <Line
                yAxisId="quantity"
                type="monotone"
                dataKey="quantity"
                name="Quantité"
                stroke="#0d9488"
                strokeWidth={2.5}
                strokeDasharray="4 4"
                dot={{ r: 3, fill: '#0d9488' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function TopProductsChart({ result }: ChartsProps) {
  const data = result.products.slice(0, 10).map((p) => ({
    name: p.product,
    amount: p.totalAmount,
  }));

  if (data.length === 0) {
    return null;
  }

  return (
    <Card className="border-slate-200 dark:border-slate-800">
      <CardHeader>
        <CardTitle>Top 10 des produits</CardTitle>
        <CardDescription>Par chiffre d'affaires</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-80 w-full pr-4">
          <div className="space-y-2">
            {data.map((p, idx) => {
              const maxAmount = data[0].amount || 1;
              const widthPercent = (p.amount / maxAmount) * 100;
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-900 dark:text-slate-100 truncate pr-2">
                      {p.name}
                    </span>
                    <span className="text-slate-700 dark:text-slate-300 shrink-0">
                      {formatEuro(p.amount)}
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${widthPercent}%`,
                        backgroundColor: COLORS[idx % COLORS.length],
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
