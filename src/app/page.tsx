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
  Users,
  TrendingUp,
  Package,
  Globe,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Toaster, toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { KpiGrid } from '@/components/kpi-grid';
import { ChartsGrid } from '@/components/charts-followup';
import { TopEnseignesCard } from '@/components/top-enseignes';
import { TopEnseignesPeriodCard } from '@/components/top-enseignes-period';
import { AgentPeriodPerformance } from '@/components/agent-period-performance';
import { SyntheseGlobale } from '@/components/synthese-globale';
import { EvolutionCaCentrale } from '@/components/evolution-ca-centrale';
import { AgentTable, CustomerFollowupTable, EnseigneTable } from '@/components/followup-tables';
import { SalesDetailTable } from '@/components/sales-detail-table';
import { ImportDialog } from '@/components/import-dialog';
import { PeriodSelector } from '@/components/period-selector';
import { AppSidebar } from '@/components/app-sidebar';
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
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [availableAgents, setAvailableAgents] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'month' | 'global'>('month');
  const [error, setError] = useState<string | null>(null);

  // Chargement initial : période courante + agents
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
      try {
        const res = await fetch('/api/agents');
        const json = await res.json();
        if (json.ok && Array.isArray(json.data)) {
          setAvailableAgents(
            json.data
              .map((a: { name: string; isActive: boolean }) => a.name)
              .filter((n: string) => n)
          );
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  const loadDashboard = useCallback(async (y: number, m: number, agent: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/dashboard?year=${y}&month=${m}&agent=${encodeURIComponent(agent)}`;
      const res = await fetch(url);
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
      loadDashboard(year, month, agentFilter);
    }
  }, [year, month, agentFilter, loadDashboard]);

  const loadSales = useCallback(async () => {
    if (year === null || month === null) return;
    setLoadingSales(true);
    try {
      const res = await fetch(
        `/api/sales?year=${year}&month=${month}&agent=${encodeURIComponent(agentFilter)}`
      );
      const json = await res.json();
      if (json.ok) setSalesRows(json.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSales(false);
    }
  }, [year, month, agentFilter]);

  const handlePeriodChange = (y: number, m: number) => {
    setYear(y);
    setMonth(m);
  };

  const handleAgentChange = (agent: string) => {
    setAgentFilter(agent);
  };

  // Bouton Accueil : retour à la période courante + agent "Tous"
  const handleHome = async () => {
    setAgentFilter('all');
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
    toast.success('Retour à l\'accueil');
  };

  const handleImported = async () => {
    try {
      const res = await fetch('/api/period');
      const json = await res.json();
      if (json.ok) {
        setYear(json.data.year);
        setMonth(json.data.month);
      }
    } catch {
      if (year && month) loadDashboard(year, month, agentFilter);
    }
    try {
      const res = await fetch('/api/agents');
      const json = await res.json();
      if (json.ok && Array.isArray(json.data)) {
        setAvailableAgents(
          json.data
            .map((a: { name: string; isActive: boolean }) => a.name)
            .filter((n: string) => n)
        );
      }
    } catch {
      // ignore
    }
    setTimeout(loadSales, 200);
    toast.success('Données rafraîchies après import');
  };

  const handleGeneratePdf = async (agentFilterForPdf: string | null) => {
    if (!data) return;
    setGeneratingPdf(true);
    try {
      await generateBilanPdf({ data, agentFilter: agentFilterForPdf });
      toast.success('Bilan PDF généré', {
        description: agentFilterForPdf ? `Rapport de ${agentFilterForPdf}` : 'Bilan global',
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
    <div className="min-h-screen bg-background flex">
      <AppSidebar data={data} agentFilter={agentFilter} onHome={handleHome} />

      {/* Contenu principal décalé à droite du sidebar (w-64 = 16rem) */}
      <div className="flex-1 ml-64 flex flex-col min-h-screen">
        {/* === TOP BAR : uniquement Période + Agent + Bilan + Import === */}
        <header className="border-b border-border bg-card sticky top-0 z-30">
          <div className="px-4 sm:px-6 lg:px-8 py-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              {/* Titre période à gauche */}
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-primary" />
                {viewMode === 'month' ? (
                  <span className="text-muted-foreground">Période analysée :</span>
                ) : (
                  <span className="text-muted-foreground">Vue globale période :</span>
                )}
                <strong className="font-title text-foreground">
                  {viewMode === 'month' ? currentPeriodLabel : 'Toute la période'}
                </strong>
                {viewMode === 'month' && data && data.kpis.previous && (
                  <span className="ml-2 text-xs">
                    <span className="text-muted-foreground">vs {data.kpis.previous.label} :</span>{' '}
                    <span className={data.kpis.evolution.caHT >= 0 ? 'text-primary font-medium' : 'text-destructive font-medium'}>
                      {data.kpis.evolution.caHT >= 0 ? '+' : ''}
                      {formatEuro(data.kpis.evolution.caHT)}
                    </span>
                  </span>
                )}
              </div>

              {/* Toggle Global / Mensuel */}
              <div className="flex items-center gap-1 rounded-md bg-muted p-0.5">
                <button
                  onClick={() => setViewMode('month')}
                  className={`px-3 py-1 text-xs font-medium rounded ${viewMode === 'month' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground'}`}
                >
                  Mensuel
                </button>
                <button
                  onClick={() => setViewMode('global')}
                  className={`px-3 py-1 text-xs font-medium rounded ${viewMode === 'global' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground'}`}
                >
                  <Globe className="h-3 w-3 inline mr-1" />Global
                </button>
              </div>

              {/* Sélecteurs à droite */}
              <div className="flex items-center gap-2 flex-wrap">
                {data && (
                  <PeriodSelector
                    periods={data.availablePeriods}
                    currentYear={year!}
                    currentMonth={month!}
                    onPeriodChange={handlePeriodChange}
                  />
                )}

                {/* Sélecteur d'agent commercial */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted">
                  <Users className="h-4 w-4 text-primary" />
                  <Select value={agentFilter} onValueChange={handleAgentChange}>
                    <SelectTrigger className="border-0 bg-transparent shadow-none p-0 h-auto focus:ring-0 font-medium w-[150px]">
                      <SelectValue placeholder="Tous les agents" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous les agents</SelectItem>
                      {availableAgents.map((a) => (
                        <SelectItem key={a} value={a}>
                          {a}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  size="sm"
                  onClick={() => handleGeneratePdf(agentFilter === 'all' ? null : agentFilter)}
                  disabled={!data || generatingPdf}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                  title="Générer un bilan PDF (agent sélectionné ou global)"
                >
                  <FileDown className="h-4 w-4 mr-2" />
                  Bilan PDF
                </Button>

                <ImportDialog onImported={handleImported} />

                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => year && month && loadDashboard(year, month, agentFilter)}
                  title="Rafraîchir"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>
          </div>
        </header>

        {/* === CONTENU PRINCIPAL === */}
        <main className="w-full px-4 sm:px-6 lg:px-8 py-6 flex-1">
          {error && (
            <Card className="border-destructive/30 bg-destructive/5 mb-6">
              <CardContent className="p-4">
                <p className="text-sm text-destructive">Erreur : {error}</p>
              </CardContent>
            </Card>
          )}

          {loading || !data ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 mb-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : viewMode === 'global' ? (
            <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <Card className="border-primary/30 bg-primary/5"><CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase">CA Total HT</p>
                <p className="text-xl font-title font-bold text-primary">{formatEuro(data.global.totalCaHT)}</p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase">BL Total</p>
                <p className="text-xl font-title font-bold">{formatNumber(data.global.totalNbBl)}</p>
                <p className="text-[10px] text-muted-foreground">{data.global.totalBlDirect} D / {data.global.totalBlCentrale} C</p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase">Commission</p>
                <p className="text-xl font-title font-bold text-destructive">{formatEuro(data.global.totalCommission)}</p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase">Colis vendus</p>
                <p className="text-xl font-title font-bold">{formatNumber(data.global.totalColis ?? 0)}</p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase">Pots vendus</p>
                <p className="text-xl font-title font-bold">{formatNumber(data.global.totalPots ?? 0)}</p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase">Enseignes</p>
                <p className="text-xl font-title font-bold">{formatNumber(data.global.totalEnseignes)}</p>
              </CardContent></Card>
            </div>
          ) : (
            <div className="mb-6">
              <KpiGrid kpis={data.kpis} agentFilter={agentFilter} />
            </div>
          )}

          {!loading && data && (
            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList className="bg-muted flex flex-wrap h-auto">
                <TabsTrigger
                  value="overview"
                  className="data-[state=active]:bg-card data-[state=active]:text-primary"
                >
                  <LayoutDashboard className="h-4 w-4 mr-2" />
                  Vue d'ensemble
                </TabsTrigger>
                <TabsTrigger
                  value="agents"
                  className="data-[state=active]:bg-card data-[state=active]:text-primary"
                >
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Agents
                </TabsTrigger>
                <TabsTrigger
                  value="centrale-evolution"
                  className="data-[state=active]:bg-card data-[state=active]:text-primary"
                >
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Évolution CA
                </TabsTrigger>
                <TabsTrigger
                  value="enseignes"
                  className="data-[state=active]:bg-card data-[state=active]:text-primary"
                >
                  <Building2 className="h-4 w-4 mr-2" />
                  Enseignes
                </TabsTrigger>
                <TabsTrigger
                  value="clients"
                  className="data-[state=active]:bg-card data-[state=active]:text-primary"
                >
                  <HeartHandshake className="h-4 w-4 mr-2" />
                  Clients à relancer
                </TabsTrigger>
                <TabsTrigger
                  value="data"
                  className="data-[state=active]:bg-card data-[state=active]:text-primary"
                  onClick={loadSales}
                >
                  <Table2 className="h-4 w-4 mr-2" />
                  Détail ventes
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                {/* Synthèse globale CA Direct/Centrale sur la période */}
                <SyntheseGlobale data={data} />

                {/* Charts (pie + barres) */}
                <ChartsGrid
                  kpis={data.kpis}
                  monthlySeries={data.monthlySeries}
                  agents={data.agents}
                  enseignes={data.enseignes}
                />

                {/* Performances des commerciaux sur TOUTE la période */}
                <AgentPeriodPerformance agents={data.agentPeriodTotals} />

                {/* Top enseignes du mois + top enseignes sur la période */}
                <div className="grid gap-4 lg:grid-cols-2">
                  <TopEnseignesCard enseignes={data.enseignes} />
                  <TopEnseignesPeriodCard enseignes={data.topEnseignesPeriod} />
                </div>
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
                      className="border-primary/30 text-primary hover:bg-primary/10"
                    >
                      <FileDown className="h-3.5 w-3.5 mr-1.5" />
                      Bilan {a.agent}
                    </Button>
                  ))}
                </div>
                <AgentTable agents={data.agents} />
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">
                      Performance des commerciaux sur la période sélectionnée. Cliquez sur
                      « Bilan &lt;agent&gt; » pour générer un rapport PDF individuel à envoyer.
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="centrale-evolution" className="space-y-4">
                <EvolutionCaCentrale monthlySeries={data.monthlySeries} />
              </TabsContent>

              <TabsContent value="enseignes" className="space-y-4">
                <EnseigneTable enseignes={data.enseignes} />
              </TabsContent>

              <TabsContent value="clients" className="space-y-4">
                <CustomerFollowupTable 
                  customers={data.customerFollowup} 
                  availableAgents={availableAgents}
                />
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">
                      <strong>Règle de relance :</strong> un client est « à relancer » si sa dernière commande
                      remonte à <strong>plus de 30 jours</strong> (délai de prise de commande = 1 mois), et « inactif »
                      si elle remonte à <strong>plus de 90 jours</strong>. Les coopératives (SCAOUEST, SCACHAP,
                      ALDOUEST, OTERA, SCAPEST) ne sont jamais marquées inactives car ce sont des structures
                      récurrentes. La colonne <strong>« Dern. cmd »</strong> indique la date à appeler pour relancer.
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

        <footer className="border-t border-border bg-card mt-auto">
          <div className="px-4 sm:px-6 lg:px-8 py-3 text-center text-xs text-muted-foreground">
            {data ? `${formatNumber(data.global.totalNbBl)} ventes historiques` : 'Chargement...'} •
            {' '}Période : {data ? `${data.global.dateRange.start} → ${data.global.dateRange.end}` : '—'}
            {agentFilter !== 'all' ? ` • Commercial : ${agentFilter}` : ''}
          </div>
        </footer>
      </div>

      <Toaster richColors position="top-right" />
    </div>
  );
}
