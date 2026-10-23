'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Calculator, Loader2, TrendingUp, TrendingDown, Euro, PieChart as PieIcon, Building2, Info } from 'lucide-react';
import { AppSidebar } from '@/components/app-sidebar';
import { DateRangeFilter } from '@/components/date-range-filter';
import type { DashboardData } from '@/lib/dashboard-types';
import { formatNumber, formatEuro, formatPercent } from '@/lib/dashboard-service';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, LineChart, Line } from 'recharts';

const COLORS = ['#f7a941', '#3674b5', '#bb7e40', '#a6d6c9', '#e30613', '#ffe111', '#ca8a04', '#db2777'];

interface AnalytiqueData {
  period: { start: string; end: string };
  globalKpis: {
    totalCA: number;
    totalCharges: number;
    totalDirect: number;
    totalShared: number;
    margeBrute: number;
    margeBrutePct: number;
    nbVentes: number;
    nbClients: number;
    nbCharges: number;
  };
  categoryBreakdown: Array<{ category: string; amount: number; pct: number }>;
  clients: Array<{
    enseigne: string;
    ca: number;
    directCharges: number;
    proportionalCharges: number;
    totalCharges: number;
    marge: number;
    margePct: number;
  }>;
  topCharges: Array<{
    date: string; category: string; subLabel: string | null;
    vendor: string | null; amountHT: number; enseigne: string | null;
  }>;
  topVendors: Array<{
    vendor: string; totalHT: number; count: number; category: string; pct: number;
  }>;
  monthlySeries: Array<{
    year: number; month: number; label: string;
    ca: number; charges: number; marge: number;
  }>;
}

export default function AnalytiquePage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [analytique, setAnalytique] = useState<AnalytiqueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [view, setView] = useState<'global' | 'parClient'>('global');

  const loadDashboard = useCallback(async () => {
    try {
      const periodRes = await fetch('/api/period');
      const periodJson = await periodRes.json();
      const { year, month } = periodJson.ok ? periodJson.data : { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
      const res = await fetch(`/api/dashboard?year=${year}&month=${month}`);
      const json = await res.json();
      if (json.ok) setData(json.data);
    } catch {}
  }, []);

  const loadAnalytique = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (dateRange.start && dateRange.end) {
        params.set('startDate', dateRange.start);
        params.set('endDate', dateRange.end);
      }
      const url = `/api/charges/analytique${params.toString() ? '?' + params.toString() : ''}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.ok) setAnalytique(json.data);
    } catch {}
    setLoading(false);
  }, [dateRange]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  useEffect(() => { loadAnalytique(); }, [loadAnalytique]);

  const handleHome = () => { window.location.href = '/'; };

  if (loading || !analytique) {
    return (
      <div className="min-h-screen bg-background flex">
        <AppSidebar data={data} agentFilter="all" onHome={handleHome} />
        <div className="flex-1 ml-64 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      </div>
    );
  }

  const { globalKpis, categoryBreakdown, clients, topCharges, topVendors, monthlySeries } = analytique;
  const hasData = globalKpis.nbVentes > 0 || globalKpis.nbCharges > 0;

  // Pour le camembert: limiter à top 10 catégories + grouper le reste en "Autres"
  // (au lieu d'afficher 72 slices illisibles)
  const top10 = (categoryBreakdown || []).slice(0, 10);
  const others = (categoryBreakdown || []).slice(10);
  const othersSum = others.reduce((s, c) => s + c.amount, 0);
  const othersPct = others.reduce((s, c) => s + c.pct, 0);
  const pieData = others.length > 0
    ? [...top10, { category: `Autres (${others.length})`, amount: othersSum, pct: othersPct }]
    : top10;

  // Top 10 clients par CA
  const topClientsByCA = [...clients].sort((a, b) => b.ca - a.ca).slice(0, 10);
  // Top 10 clients par marge
  const topClientsByMarge = [...clients].sort((a, b) => b.marge - a.marge).slice(0, 10);

  return (
    <div className="min-h-screen bg-background flex">
      <AppSidebar data={data} agentFilter="all" onHome={handleHome} />
      <div className="flex-1 ml-64 flex flex-col min-h-screen">
        <header className="border-b border-border bg-card sticky top-0 z-30">
          <div className="px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <Link href="/"><Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Retour</Button></Link>
              <div className="hidden sm:flex items-center gap-2">
                <Calculator className="h-5 w-5 text-primary" />
                <h1 className="font-title text-lg font-bold">Feuille analytique</h1>
              </div>
            </div>
            <Link href="/charges">
              <Button size="sm" variant="outline" className="border-primary/30 text-primary hover:bg-primary/10">
                Gérer les charges
              </Button>
            </Link>
          </div>
        </header>

        <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-6 space-y-4">
          {/* Barre de filtres */}
          <Card className="border-border">
            <CardContent className="p-3 flex items-center gap-2 flex-wrap">
              <DateRangeFilter
                startDate={dateRange.start}
                endDate={dateRange.end}
                onChange={(s, e) => setDateRange({ start: s, end: e })}
                onReset={() => setDateRange({ start: '', end: '' })}
              />
              <span className="text-xs text-muted-foreground ml-auto">
                Période: <strong>{analytique.period.start}</strong> → <strong>{analytique.period.end}</strong>
              </span>
              <div className="flex items-center gap-1 rounded-md bg-muted p-0.5">
                <button
                  onClick={() => setView('global')}
                  className={`px-3 py-1.5 text-xs font-medium rounded ${view === 'global' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground'}`}
                >
                  Vue globale
                </button>
                <button
                  onClick={() => setView('parClient')}
                  className={`px-3 py-1.5 text-xs font-medium rounded ${view === 'parClient' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground'}`}
                >
                  Par client
                </button>
              </div>
            </CardContent>
          </Card>

          {!hasData ? (
            <Card className="border-border">
              <CardContent className="p-12 text-center">
                <Calculator className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-40" />
                <p className="text-sm text-muted-foreground mb-2">Aucune donnée pour cette période.</p>
                <p className="text-xs text-muted-foreground">Importez des ventes et des charges pour générer le rapport analytique.</p>
              </CardContent>
            </Card>
          ) : view === 'global' ? (
            <>
              {/* KPIs globaux */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">CA total HT</p>
                    <p className="text-lg font-title font-bold text-primary">{formatEuro(globalKpis.totalCA)}</p>
                    <p className="text-[10px] text-muted-foreground">{formatNumber(globalKpis.nbVentes)} ventes • {formatNumber(globalKpis.nbClients)} clients</p>
                  </CardContent>
                </Card>
                <Card className="border-destructive/30 bg-destructive/5">
                  <CardContent className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Charges totales HT</p>
                    <p className="text-lg font-title font-bold text-destructive">{formatEuro(globalKpis.totalCharges)}</p>
                    <p className="text-[10px] text-muted-foreground">{formatNumber(globalKpis.nbCharges)} lignes • directes: {formatEuro(globalKpis.totalDirect)}</p>
                  </CardContent>
                </Card>
                <Card className={globalKpis.margeBrute >= 0 ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-destructive/30 bg-destructive/5'}>
                  <CardContent className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Marge brute</p>
                    <p className={`text-lg font-title font-bold ${globalKpis.margeBrute >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                      {globalKpis.margeBrute >= 0 ? '+' : ''}{formatEuro(globalKpis.margeBrute)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{globalKpis.margeBrutePct.toFixed(1)}% du CA</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Taux de marge</p>
                    <p className={`text-lg font-title font-bold ${globalKpis.margeBrutePct >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                      {formatPercent(globalKpis.margeBrutePct)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">part des charges: {((globalKpis.totalCharges / Math.max(globalKpis.totalCA, 1)) * 100).toFixed(1)}%</p>
                  </CardContent>
                </Card>
              </div>

              {/* Graph mensuel CA vs charges vs marge */}
              {monthlySeries.length > 0 && (
                <Card className="border-border">
                  <CardHeader>
                    <CardTitle className="font-title flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" /> Évolution mensuelle : CA, Charges, Marge</CardTitle>
                    <CardDescription>Comparaison mensuelle du chiffre d'affaires et des charges supportées</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-80 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={monthlySeries} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e8d6a4" />
                          <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#7a654a" angle={-45} textAnchor="end" height={60} />
                          <YAxis tick={{ fontSize: 10 }} stroke="#7a654a" tickFormatter={(v) => formatNumber(v)} />
                          <Tooltip contentStyle={{ backgroundColor: '#fffaf0', border: '1px solid #e8d6a4', borderRadius: '8px', fontSize: '12px' }} formatter={(v: number, name: string) => [formatEuro(v), name]} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Bar dataKey="ca" name="CA HT" fill="#f7a941" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="charges" name="Charges HT" fill="#e30613" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="marge" name="Marge" fill="#3674b5" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                {/* Répartition des charges par catégorie — top 10 + Autres */}
                <Card className="border-border">
                  <CardHeader>
                    <CardTitle className="font-title flex items-center gap-2"><PieIcon className="h-5 w-5 text-primary" /> Répartition des charges</CardTitle>
                    <CardDescription>Ventilation HT — top 10 catégories + autres regroupés</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieData}
                            dataKey="amount"
                            nameKey="category"
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            innerRadius={40}
                            paddingAngle={2}
                          >
                            {pieData.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                          </Pie>
                          <Tooltip contentStyle={{ backgroundColor: '#fffaf0', border: '1px solid #e8d6a4', borderRadius: '8px', fontSize: '12px' }} formatter={(v: number, name: string) => [formatEuro(v), name]} />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Tableau répartition catégories — toutes */}
                <Card className="border-border">
                  <CardHeader>
                    <CardTitle className="font-title text-base">Détail par catégorie</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-72 overflow-y-auto">
                      {categoryBreakdown.map((c, idx) => {
                        const max = categoryBreakdown[0]?.amount || 1;
                        return (
                          <div key={c.category} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-medium truncate flex-1">
                                <span className="text-muted-foreground mr-1.5">{idx + 1}.</span>
                                {c.category}
                              </span>
                              <div className="flex gap-3 text-right shrink-0">
                                <span className="font-semibold text-primary">{formatEuro(c.amount)}</span>
                                <span className="text-muted-foreground w-12">{c.pct.toFixed(1)}%</span>
                              </div>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${(c.amount / max) * 100}%`, backgroundColor: COLORS[idx % COLORS.length] }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Top 15 fournisseurs */}
              {topVendors && topVendors.length > 0 && (
                <Card className="border-border">
                  <CardHeader>
                    <CardTitle className="font-title flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" /> Top 15 fournisseurs les plus coûteux</CardTitle>
                    <CardDescription>Sur la période — tri par coût total HT</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[480px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={topVendors}
                          layout="vertical"
                          margin={{ top: 5, right: 60, left: 5, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#e8d6a4" horizontal={false} />
                          <XAxis
                            type="number"
                            tickFormatter={(v) => formatNumber(Math.round(v / 1000)) + 'k€'}
                            tick={{ fontSize: 10, fill: '#7a654a' }}
                            stroke="#e8d6a4"
                          />
                          <YAxis
                            type="category"
                            dataKey="vendor"
                            width={160}
                            tick={{ fontSize: 10, fill: '#7a654a' }}
                            stroke="#e8d6a4"
                            tickFormatter={(v: string) => v.length > 26 ? v.slice(0, 26) + '…' : v}
                          />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#fffaf0', border: '1px solid #e8d6a4', borderRadius: '8px', fontSize: '12px' }}
                            formatter={(value: number, _name: string, props) => {
                              const p = props?.payload;
                              return [
                                `${formatEuro(value)} • ${p?.count ?? 0} factures • ${p?.pct?.toFixed(1) ?? 0}% • ${p?.category ?? ''}`,
                                p?.vendor,
                              ];
                            }}
                          />
                          <Bar dataKey="totalHT" name="Total HT" radius={[0, 4, 4, 0]}>
                            {topVendors.map((_, idx) => (
                              <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Top charges les plus coûteuses */}
              {topCharges.length > 0 && (
                <Card className="border-border">
                  <CardHeader>
                    <CardTitle className="font-title flex items-center gap-2"><Euro className="h-5 w-5 text-primary" /> Top 20 charges</CardTitle>
                    <CardDescription>Les montants les plus élevés sur la période</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto max-h-72 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted sticky top-0">
                          <tr>
                            <th className="text-left p-2">Date</th>
                            <th className="text-left p-2">Catégorie</th>
                            <th className="text-left p-2">Libellé</th>
                            <th className="text-left p-2 hidden md:table-cell">Fournisseur</th>
                            <th className="text-left p-2 hidden md:table-cell">Client</th>
                            <th className="text-right p-2">Montant HT</th>
                          </tr>
                        </thead>
                        <tbody>
                          {topCharges.map((c, i) => (
                            <tr key={i} className="border-b border-border">
                              <td className="p-2">{c.date}</td>
                              <td className="p-2"><span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">{c.category}</span></td>
                              <td className="p-2 truncate max-w-[200px]">{c.subLabel ?? '—'}</td>
                              <td className="p-2 hidden md:table-cell text-xs">{c.vendor ?? '—'}</td>
                              <td className="p-2 hidden md:table-cell text-xs">{c.enseigne ?? '—'}</td>
                              <td className="p-2 text-right font-semibold text-destructive">{formatEuro(c.amountHT)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            /* === VUE PAR CLIENT === */
            <>
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <div className="text-xs text-muted-foreground space-y-2">
                      <p>
                        <strong>« Charges par client » correspond à quoi ?</strong> Pour chaque
                        client de la liste ci-dessous, le système calcule un <em>coût
                        imputé</em> qui n'est pas un coût réel facturé à ce client, mais
                        une <strong>estimation analytique</strong> basée sur la méthode
                        d'allocation suivante :
                      </p>
                      <ul className="list-disc pl-5 space-y-1">
                        <li>
                          <strong>Charges directes (allocation DIRECT)</strong> :
                          factures de charges importées avec un champ « enseigne »
                          (client) renseigné (ex: livraisons, transport sur ventes).
                          Ces charges sont <strong>attribuées 100% au client</strong>.
                        </li>
                        <li>
                          <strong>Charges globales (allocation GLOBAL)</strong> :
                          toutes les autres charges (loyer, salaires, électricité,
                          carburant non rattaché à un BL, etc.). Ces charges sont
                          ventilées <strong>au prorata du CA</strong> du client sur
                          la période (si un client fait 10% du CA → il prend 10% des
                          charges globales).
                        </li>
                      </ul>
                      <p className="pt-1">
                        <strong>Marge du client</strong> = CA du client − charges directes
                        du client − part proportionnelle des charges globales.
                      </p>
                      <p className="text-[10px] italic">
                        NB: dans le fichier K FACTORY actuel, très peu de charges ont le
                        champ « enseigne » renseigné — la quasi-totalité des charges est
                        donc ventilée au prorata. Pour des marges par client plus
                        précises, il faudrait renseigner le client final sur les charges
                        de transport/livraison directement attribuables.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-4 lg:grid-cols-2">
                {/* Top 10 clients par CA */}
                <Card className="border-border">
                  <CardHeader>
                    <CardTitle className="font-title text-base flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Top 10 clients par CA</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {topClientsByCA.map((c, idx) => {
                        const max = topClientsByCA[0]?.ca || 1;
                        return (
                          <div key={c.enseigne} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-medium truncate flex-1">
                                <span className="text-muted-foreground mr-1.5">{idx + 1}.</span>
                                {c.enseigne}
                              </span>
                              <div className="flex gap-3 text-right shrink-0">
                                <span className="text-xs text-muted-foreground">{c.margePct.toFixed(1)}%</span>
                                <span className="font-semibold text-primary">{formatEuro(c.ca)}</span>
                              </div>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-primary rounded-full" style={{ width: `${(c.ca / max) * 100}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* Top 10 clients par marge */}
                <Card className="border-border">
                  <CardHeader>
                    <CardTitle className="font-title text-base flex items-center gap-2"><TrendingDown className="h-4 w-4 text-primary" /> Top 10 clients par marge</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {topClientsByMarge.map((c, idx) => {
                        const max = Math.max(...topClientsByMarge.map(x => Math.abs(x.marge)), 1);
                        const pct = (Math.abs(c.marge) / max) * 100;
                        return (
                          <div key={c.enseigne} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-medium truncate flex-1">
                                <span className="text-muted-foreground mr-1.5">{idx + 1}.</span>
                                {c.enseigne}
                              </span>
                              <div className="flex gap-3 text-right shrink-0">
                                <span className="text-xs text-muted-foreground">{c.margePct.toFixed(1)}%</span>
                                <span className={`font-semibold ${c.marge >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                                  {c.marge >= 0 ? '+' : ''}{formatEuro(c.marge)}
                                </span>
                              </div>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${c.marge >= 0 ? 'bg-emerald-500' : 'bg-destructive'}`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Table détaillée par client */}
              <Card className="border-border">
                <CardHeader>
                  <CardTitle className="font-title text-base">Détail analytique par client</CardTitle>
                  <CardDescription>{formatNumber(clients.length)} clients avec activité sur la période — trié par marge décroissante</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto max-h-[55vh] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          <th className="text-left p-2">Client</th>
                          <th className="text-right p-2">CA HT</th>
                          <th className="text-right p-2 hidden md:table-cell">Charges directes</th>
                          <th className="text-right p-2 hidden md:table-cell">Part charges globales</th>
                          <th className="text-right p-2">Total charges</th>
                          <th className="text-right p-2">Marge</th>
                          <th className="text-right p-2">Marge %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clients.map((c, idx) => (
                          <tr key={idx} className={`border-b border-border ${c.marge < 0 ? 'bg-destructive/5' : ''}`}>
                            <td className="p-2 font-medium truncate max-w-[200px]" title={c.enseigne}>{c.enseigne}</td>
                            <td className="p-2 text-right text-primary font-semibold">{formatEuro(c.ca)}</td>
                            <td className="p-2 text-right hidden md:table-cell text-xs">{c.directCharges > 0 ? formatEuro(c.directCharges) : '—'}</td>
                            <td className="p-2 text-right hidden md:table-cell text-xs text-muted-foreground">{formatEuro(c.proportionalCharges)}</td>
                            <td className="p-2 text-right text-destructive">{formatEuro(c.totalCharges)}</td>
                            <td className={`p-2 text-right font-semibold ${c.marge >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                              {c.marge >= 0 ? '+' : ''}{formatEuro(c.marge)}
                            </td>
                            <td className={`p-2 text-right text-xs font-medium ${c.margePct >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                              {c.margePct.toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-muted sticky bottom-0">
                        <tr>
                          <td className="p-2 font-bold">TOTAL</td>
                          <td className="p-2 text-right font-bold text-primary">{formatEuro(globalKpis.totalCA)}</td>
                          <td className="p-2 text-right hidden md:table-cell text-xs">{formatEuro(globalKpis.totalDirect)}</td>
                          <td className="p-2 text-right hidden md:table-cell text-xs">{formatEuro(globalKpis.totalShared)}</td>
                          <td className="p-2 text-right font-bold text-destructive">{formatEuro(globalKpis.totalCharges)}</td>
                          <td className={`p-2 text-right font-bold ${globalKpis.margeBrute >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                            {globalKpis.margeBrute >= 0 ? '+' : ''}{formatEuro(globalKpis.margeBrute)}
                          </td>
                          <td className={`p-2 text-right text-xs font-bold ${globalKpis.margeBrutePct >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                            {globalKpis.margeBrutePct.toFixed(1)}%
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
