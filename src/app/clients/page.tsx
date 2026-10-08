'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, BarChart3, Store, FileText } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AppSidebar } from '@/components/app-sidebar';
import { SettingsPanel } from '@/components/settings-panel';
import { ClientTariffPanel } from '@/components/client-tariff-panel';
import type { DashboardData } from '@/lib/dashboard-types';
import { formatEuro, formatNumber } from '@/lib/dashboard-service';

export default function ClientsPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [tab, setTab] = useState('clients');

  const loadDashboard = useCallback(async () => {
    try {
      const periodRes = await fetch('/api/period');
      const periodJson = await periodRes.json();
      const { year, month } = periodJson.ok
        ? periodJson.data
        : { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
      const res = await fetch(`/api/dashboard?year=${year}&month=${month}`);
      const json = await res.json();
      if (json.ok) setData(json.data);
    } catch {}
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  const handleHome = () => { window.location.href = '/'; };

  return (
    <div className="min-h-screen bg-background flex">
      <AppSidebar data={data} agentFilter="all" onHome={handleHome} />

      <div className="flex-1 ml-64 flex flex-col min-h-screen">
        <header className="border-b border-border bg-card sticky top-0 z-30">
          <div className="px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <Link href="/">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Retour
                </Button>
              </Link>
              <div className="hidden sm:flex items-center gap-2">
                <Store className="h-5 w-5 text-primary" />
                <h1 className="font-title text-lg font-bold">Clients</h1>
              </div>
            </div>
            {data && (
              <div className="text-xs text-muted-foreground">
                CA total : <span className="font-medium text-primary">{formatEuro(data.global.totalCaHT)}</span>
                {' • '}{formatNumber(data.global.totalNbBl)} BL
                {' • '}{formatNumber(data.global.totalEnseignes)} enseignes
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-6">
          <Tabs value={tab} onValueChange={setTab} className="space-y-4">
            <TabsList className="bg-muted flex flex-wrap h-auto">
              <TabsTrigger value="clients" className="data-[state=active]:bg-card data-[state=active]:text-primary">
                <Store className="h-4 w-4 mr-2" />
                Liste clients
              </TabsTrigger>
              <TabsTrigger value="tarifs" className="data-[state=active]:bg-card data-[state=active]:text-primary">
                <FileText className="h-4 w-4 mr-2" />
                Grille tarifaire
              </TabsTrigger>
            </TabsList>

            <TabsContent value="clients" className="space-y-4">
              <SettingsPanel initialTab="enseignes" />
            </TabsContent>

            <TabsContent value="tarifs" className="space-y-4">
              <ClientTariffPanel />
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
}
