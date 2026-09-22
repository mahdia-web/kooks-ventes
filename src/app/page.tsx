'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  LayoutDashboard,
  Building2,
  HeartHandshake,
  Table2,
  RefreshCw,
  Calendar,
  FileDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Toaster, toast } from 'sonner';
import { KpiGrid } from '@/components/kpi-grid';
import { ChartsGrid } from '@/components/charts-followup';
import { TopEnseignesCard } from '@/components/top-enseignes';
import { AgentTable, CustomerFollowupTable, EnseigneTable } from '@/components/followup-tables';
import { SalesDetailTable } from '@/components/sales-detail-table';
import { ImportDialog } from '@/components/import-dialog';
import { PeriodSelector } from '@/components/period-selector';
import { generateBilanPdf } from '@/components/bilan-pdf';
import { formatEuro, formatNumber, monthLabel } from '@/lib/dashboard-service';
import type { DashboardData, SaleRow } from '@/lib/dashboard-types';

export default function Home() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [salesRows, setSalesRows] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSales, setLoadingSales] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Chargement initial : récupère la période courante
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/period');
        const json = await res.json();
        if (json.ok) {
          setYear(json.data.year);
          setMonth(json.data.month);
        } else {
          const now = new Date();
          setYear(now.getFullYear());
          setMonth(now.getMonth() + 1);
        }
      } catch {
        const now = new Date();
        setYear(now.getFullYear());
        setMonth(now.getMonth() + 1);
      }
    })();
  }, []);

  const loadDashboard = useCallback(async (y: number, m: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard?year=${y}&month=${m}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setData(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (year !== null && month !== null) {
      loadDashboard(year, month);
    }
  }, [year, month, loadDashboard]);

  const loadSales = useCallback(async () => {
    if (year === null || month === null) return;
    setLoadingSales(true);
    try {
      const res = await fetch(`/api/sales?year=${year}&month=${month}`);
      const json = await res.json();
      if (json.ok) setSalesRows(json.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSales(false);
    }
  }, [year, month]);

  const handlePeriodChange = (y: number, m: number) => {
    setYear(y);
    setMonth(m);
  };

  const handleImported = async () => {
    // Re-fetch la période courante (mise à jour par l'import)
    try {
      const res = await fetch('/api/period');
      const json = await res.json();
      if (json.ok) {
        setYear(json.data.year);
        setMonth(json.data.month);
      }
    } catch {
      // Fallback : recharge avec la période actuelle
      if (year && month) loadDashboard(year, month);
    }
    setTimeout(loadSales, 200);
    toast.success('Données rafraîchies après import');
  };

  const handleGeneratePdf = async (agentFilter: string | null) => {
    if (!data) return;
    setGeneratingPdf(true);
    try {
      generateBilanPdf({ data, agentFilter });
      toast.success('Bilan PDF généré', {
        description: agentFilter ? `Rapport de ${agentFilter}` : 'Bilan global',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur';
      toast.error('Erreur génération PDF', { description: msg });
    } finally {
      setGeneratingPdf(false);
    }
  };

  const currentPeriodLabel = year && month ? `${monthLabel(month)} ${year}` : 'Chargement...';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white shrink-0">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">
                  Suivi Ventes Agents Commerciaux
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
                  CA total :{' '}
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">
                    {data ? formatEuro(data.global.totalCaHT) : '—'}
                  </span>{' '}
                  • {data ? data.global.totalNbBl : 0} BL au total •{' '}
                  {data ? data.global.totalEnseignes : 0} enseignes
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {data && (
                <PeriodSelector
                  periods={data.availablePeriods}
                  currentYear={year!}
                  currentMonth={month!}
                  onPeriodChange={handlePeriodChange}
                />
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleGeneratePdf(null)}
                disabled={!data || generatingPdf}
                className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                title="Générer un bilan PDF global"
              >
                <FileDown className="h-4 w-4 mr-2" />
                Bilan PDF
              </Button>
              <ImportDialog onImported={handleImported} />
              <Button
                variant="outline"
                size="icon"
                onClick={() => year && month && loadDashboard(year, month)}
                title="Rafraîchir"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-6 flex-1">
        <div className="mb-6">
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <Calendar className="h-4 w-4 text-emerald-600" />
            <span>
              Période analysée :{' '}
              <strong className="text-slate-900 dark:text-white">{currentPeriodLabel}</strong>
              {data && data.kpis.previous && (
                <span className="ml-2">
                  • vs {data.kpis.previous.label} :{' '}
                  <span
                    className={
                      data.kpis.evolution.caHT >= 0
                        ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                        : 'text-rose-700 dark:text-rose-400 font-medium'
                    }
                  >
                    {data.kpis.evolution.caHT >= 0 ? '+' : ''}
                    {formatEuro(data.kpis.evolution.caHT)}
                  </span>
                </span>
              )}
            </span>
          </div>
        </div>

        {error && (
          <Card className="border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/20 mb-6">
            <CardContent className="p-4">
              <p className="text-sm text-rose-700 dark:text-rose-400">Erreur : {error}</p>
            </CardContent>
          </Card>
        )}

        {loading || !data ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 mb-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="mb-6">
            <KpiGrid kpis={data.kpis} />
          </div>
        )}

        {!loading && data && (
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="bg-slate-100 dark:bg-slate-900 flex flex-wrap h-auto">
              <TabsTrigger
                value="overview"
                className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-emerald-700"
              >
                <LayoutDashboard className="h-4 w-4 mr-2" />
                Vue d'ensemble
              </TabsTrigger>
              <TabsTrigger
                value="agents"
                className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-emerald-700"
              >
                <BarChart3 className="h-4 w-4 mr-2" />
                Agents
              </TabsTrigger>
              <TabsTrigger
                value="enseignes"
                className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-emerald-700"
              >
                <Building2 className="h-4 w-4 mr-2" />
                Enseignes
              </TabsTrigger>
              <TabsTrigger
                value="clients"
                className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-emerald-700"
              >
                <HeartHandshake className="h-4 w-4 mr-2" />
                Suivi clients
              </TabsTrigger>
              <TabsTrigger
                value="data"
                className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-emerald-700"
                onClick={loadSales}
              >
                <Table2 className="h-4 w-4 mr-2" />
                Détail ventes
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <ChartsGrid
                kpis={data.kpis}
                monthlySeries={data.monthlySeries}
                agents={data.agents}
                enseignes={data.enseignes}
              />
              <TopEnseignesCard enseignes={data.enseignes} />
            </TabsContent>

            <TabsContent value="agents" className="space-y-4">
              <div className="flex justify-end gap-2 flex-wrap">
                {data.agents.map((a) => (
                  <Button
                    key={a.agent}
                    variant="outline"
                    size="sm"
                    onClick={() => handleGeneratePdf(a.agent)}
                    disabled={generatingPdf}
                    className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400"
                  >
                    <FileDown className="h-3.5 w-3.5 mr-1.5" />
                    Bilan {a.agent}
                  </Button>
                ))}
              </div>
              <AgentTable agents={data.agents} />
              <Card className="border-slate-200 dark:border-slate-800">
                <CardContent className="p-4">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Performance des commerciaux sur la période sélectionnée. Cliquez sur « Bilan &lt;agent&gt; » pour générer un rapport PDF individuel à lui envoyer.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="enseignes" className="space-y-4">
              <EnseigneTable enseignes={data.enseignes} />
            </TabsContent>

            <TabsContent value="clients" className="space-y-4">
              <CustomerFollowupTable customers={data.customerFollowup} />
              <Card className="border-slate-200 dark:border-slate-800">
                <CardContent className="p-4">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Suivi de fidélisation calculé sur toute la période disponible. Statut <strong>OK</strong> = commande dans le mois courant ou précédent • <strong>À relancer</strong> = 2 à 3 mois sans commande • <strong>Inactif</strong> = plus de 3 mois sans commande. La récurrence indique le pourcentage de mois avec commande depuis la 1ère commande.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="data" className="space-y-4">
              {loadingSales ? (
                <Skeleton className="h-96 rounded-xl" />
              ) : (
                <SalesDetailTable rows={salesRows} />
              )}
            </TabsContent>
          </Tabs>
        )}
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 mt-auto">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3 text-center text-xs text-slate-500 dark:text-slate-400">
          Données persistées en SQLite •{' '}
          {data ? `${formatNumber(data.global.totalNbBl)} ventes historiques` : 'Chargement...'} •
          {' '}Période : {data ? `${data.global.dateRange.start} → ${data.global.dateRange.end}` : '—'}
        </div>
      </footer>

      <Toaster richColors position="top-right" />
    </div>
  );
}
