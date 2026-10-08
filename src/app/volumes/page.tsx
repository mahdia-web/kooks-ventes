'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Package, TrendingUp, Upload, Loader2, Trophy, Target, Calendar } from 'lucide-react';
import { AppSidebar } from '@/components/app-sidebar';
import type { DashboardData } from '@/lib/dashboard-types';
import { formatNumber, formatDate } from '@/lib/dashboard-service';
import { toast } from 'sonner';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend } from 'recharts';

const COLORS = ['#f7a941', '#3674b5', '#bb7e40', '#a6d6c9', '#e30613', '#ffe111', '#ca8a04', '#db2777'];

const PRODUCT_MAPPING: Record<string, string> = {
  'ORIGINAL COOKIE (LOT 2)': 'Original - Lot de 2',
  'ORIGINAL (LOT 2)': 'Original - Lot de 2',
  'CRISPY CHOCO (LOT 2)': 'Crispy Choco - Lot de 2',
  'CRISPY CHOCO COOKIE (LOT 2)': 'Crispy Choco - Lot de 2',
  'PEANUT BUTTER (LOT 2)': 'Peanut Butter - Lot de 2',
  'CARAMEL PECAN (LOT 2)': 'Caramel Pecan - Lot de 2',
  'SPECULOOS (LOT 2)': 'Speculoos - Lot de 2',
  'SPEC (LOT 2)': 'Speculoos - Lot de 2',
  'COCO (LOT 2)': 'Coco - Lot de 2',
  'ORIGINAL (BOX 9': 'Original - Box de 9',
  'BOX 9': 'Original - Box de 9',
  'PAV 8': 'Original - Indiv PAV 8',
  'INDIV FOURO': 'Original - Indiv Fouro',
};
function mapProductLabel(label: string): string {
  const upper = label.toUpperCase();
  for (const [key, val] of Object.entries(PRODUCT_MAPPING)) {
    if (upper.includes(key)) return val;
  }
  return label;
}

interface VolumeStats {
  totalQuantity: number; totalPots: number; potsSinceOct: number;
  objective: number; remaining: number; progressPct: number;
  dateRange: { start: string | null; end: string | null };
  topProducts: Array<{ productLabel: string; parfum: string | null; format: string | null; totalQty: number; }>;
  topParfums: Array<{ parfum: string; totalQty: number; }>;
  topFormats: Array<{ format: string; totalQty: number; totalPots: number; }>;
  topEnseignes: Array<{ enseigne: string; totalQty: number; totalPots: number; }>;
  monthlySeries: Array<{ year: number; month: number; totalQty: number; totalPots: number; label: string; }>;
  totalRecords: number; filteredEnseigne: string | null;
}
interface Enseigne { id: string; name: string; type: string; agent: string; isActive: boolean; }

export default function VolumesPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [stats, setStats] = useState<VolumeStats | null>(null);
  const [enseignes, setEnseignes] = useState<Enseigne[]>([]);
  const [selectedEnseigne, setSelectedEnseigne] = useState<string>('');
  const [loading, setLoading] = useState(true);

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

  const loadEnseignes = useCallback(async () => {
    try { const res = await fetch('/api/enseignes'); const json = await res.json(); if (json.ok) setEnseignes(json.data.filter((e: Enseigne) => e.isActive)); } catch {}
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const url = selectedEnseigne ? `/api/volumes/stats?enseigne=${encodeURIComponent(selectedEnseigne)}` : '/api/volumes/stats';
      const res = await fetch(url); const json = await res.json(); if (json.ok) setStats(json.data);
    } catch {} setLoading(false);
  }, [selectedEnseigne]);

  useEffect(() => { loadDashboard(); loadEnseignes(); }, [loadDashboard, loadEnseignes]);
  useEffect(() => { loadStats(); }, [loadStats]);
  const handleHome = () => { window.location.href = '/'; };

  if (loading) {
    return (<div className="min-h-screen bg-background flex"><AppSidebar data={data} agentFilter="all" onHome={handleHome} /><div className="flex-1 ml-64 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></div>);
  }

  return (
    <div className="min-h-screen bg-background flex">
      <AppSidebar data={data} agentFilter="all" onHome={handleHome} />
      <div className="flex-1 ml-64 flex flex-col min-h-screen">
        <header className="border-b border-border bg-card sticky top-0 z-30">
          <div className="px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <Link href="/"><Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Retour</Button></Link>
              <div className="hidden sm:flex items-center gap-2"><Package className="h-5 w-5 text-primary" /><h1 className="font-title text-lg font-bold">Volumes & Produits</h1></div>
            </div>
            {stats && <div className="text-xs text-muted-foreground">{formatNumber(stats.totalQuantity)} colis • {formatNumber(stats.totalPots)} pots{stats.dateRange.start && ` • du ${formatDate(stats.dateRange.start)} au ${formatDate(stats.dateRange.end)}`}</div>}
          </div>
        </header>

        <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-6 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Card className="border-primary/30 bg-primary/5"><CardContent className="p-3 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground"><strong>Import mensuel.</strong> Importez le fichier "Analyse Factures Clients".</p>
              <VolumesImportButton onImported={loadStats} />
            </CardContent></Card>
            <Card className="border-border"><CardContent className="p-3 flex items-center gap-3">
              <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Filtrer par client :</span>
              <Select value={selectedEnseigne || 'all'} onValueChange={(v) => setSelectedEnseigne(v === 'all' ? '' : v)}>
                <SelectTrigger className="h-8 text-sm flex-1"><SelectValue placeholder="Tous les clients" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les clients</SelectItem>
                  {enseignes.map((e) => <SelectItem key={e.id} value={e.name}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </CardContent></Card>
          </div>

          {stats && stats.totalQuantity > 0 ? (
            <>
              {stats.dateRange.start && (
                <Card className="border-border bg-muted/30"><CardContent className="p-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5 text-primary" />
                  <span>Période des données : <strong>{formatDate(stats.dateRange.start)} → {formatDate(stats.dateRange.end)}</strong></span>
                  {stats.filteredEnseigne && <span className="ml-2 text-primary">• Client : {stats.filteredEnseigne}</span>}
                </CardContent></Card>
              )}

              {!stats.filteredEnseigne && stats.objective > 0 && (
                <Card className="border-primary/40 bg-primary/10"><CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3"><Target className="h-6 w-6 text-primary" /><div><h3 className="font-title text-base font-bold">Objectif annuel : 3 000 000 pots</h3><p className="text-xs text-muted-foreground">Année démarrée le 01/10/2026</p></div></div>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div><p className="text-xs text-muted-foreground uppercase">Pots vendus</p><p className="text-xl font-title font-bold text-primary">{formatNumber(stats.potsSinceOct)}</p></div>
                    <div><p className="text-xs text-muted-foreground uppercase">Reste à écrouler</p><p className="text-xl font-title font-bold">{formatNumber(stats.remaining)}</p></div>
                    <div><p className="text-xs text-muted-foreground uppercase">Progression</p><p className="text-xl font-title font-bold text-emerald-600">{stats.progressPct.toFixed(1)}%</p></div>
                    <div className="flex items-center"><div className="w-full h-3 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(stats.progressPct, 100)}%` }} /></div></div>
                  </div>
                </CardContent></Card>
              )}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground uppercase">Colis vendus</p><p className="text-2xl font-title font-bold text-primary">{formatNumber(stats.totalQuantity)}</p><p className="text-[10px] text-muted-foreground">{stats.dateRange.start ? `${formatDate(stats.dateRange.start)} → ${formatDate(stats.dateRange.end)}` : ''}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground uppercase">Pots vendus</p><p className="text-2xl font-title font-bold">{formatNumber(stats.totalPots)}</p><p className="text-[10px] text-muted-foreground">calculé automatiquement</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground uppercase">Produits</p><p className="text-2xl font-title font-bold">{stats.topProducts.length}</p><p className="text-[10px] text-muted-foreground">références distinctes</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground uppercase">Lignes</p><p className="text-2xl font-title font-bold">{formatNumber(stats.totalRecords)}</p><p className="text-[10px] text-muted-foreground">lignes de facture</p></CardContent></Card>
              </div>

              {stats.monthlySeries.length > 0 && (
                <Card className="border-border"><CardHeader><CardTitle className="font-title flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" /> Évolution mensuelle</CardTitle><CardDescription>Colis et pots vendus par mois</CardDescription></CardHeader>
                  <CardContent><div className="h-80 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={stats.monthlySeries} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e8d6a4" /><XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#7a654a" angle={-45} textAnchor="end" height={60} /><YAxis tick={{ fontSize: 10 }} stroke="#7a654a" tickFormatter={(v) => formatNumber(v)} />
                    <Tooltip contentStyle={{ backgroundColor: '#fffaf0', border: '1px solid #e8d6a4', borderRadius: '8px', fontSize: '12px' }} formatter={(v: number, name: string) => name === 'totalPots' ? [formatNumber(v) + ' pots', 'Pots'] : [formatNumber(v) + ' colis', 'Colis']} />
                    <Legend wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="totalQty" name="Colis" fill="#f7a941" radius={[4, 4, 0, 0]} /><Bar dataKey="totalPots" name="Pots" fill="#3674b5" radius={[4, 4, 0, 0]} />
                  </BarChart></ResponsiveContainer></div></CardContent>
                </Card>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="border-border"><CardHeader><CardTitle className="font-title flex items-center gap-2"><Trophy className="h-5 w-5 text-primary" /> Top produits</CardTitle></CardHeader>
                  <CardContent><div className="space-y-2 max-h-80 overflow-y-auto">
                    {stats.topProducts.map((p, idx) => { const maxQty = stats.topProducts[0]?.totalQty || 1; return (
                      <div key={p.productLabel} className="space-y-1">
                        <div className="flex items-center justify-between text-sm"><span className="font-medium truncate"><span className="text-muted-foreground mr-1.5">{idx + 1}.</span>{mapProductLabel(p.productLabel)}</span><span className="font-semibold text-primary shrink-0 ml-2">{formatNumber(p.totalQty)}</span></div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${(p.totalQty / maxQty) * 100}%` }} /></div>
                      </div> ); })}
                  </div></CardContent>
                </Card>
                <Card className="border-border"><CardHeader><CardTitle className="font-title">Répartition par parfum</CardTitle></CardHeader>
                  <CardContent><div className="h-72 w-full"><ResponsiveContainer width="100%" height="100%"><PieChart>
                    <Pie data={stats.topParfums.map(p => ({ name: p.parfum, value: p.totalQty }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40} paddingAngle={2}>
                      {stats.topParfums.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#fffaf0', border: '1px solid #e8d6a4', borderRadius: '8px', fontSize: '12px' }} formatter={(v: number) => [formatNumber(v) + ' colis', 'Volume']} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart></ResponsiveContainer></div></CardContent>
                </Card>
              </div>

              <Card className="border-border"><CardHeader><CardTitle className="font-title">Volume par format — détails</CardTitle></CardHeader>
                <CardContent><div className="space-y-3">
                  {stats.topFormats.map((f) => { const max = stats.topFormats[0]?.totalQty || 1; const pct = stats.totalQuantity > 0 ? (f.totalQty / stats.totalQuantity) * 100 : 0; return (
                    <div key={f.format} className="space-y-1">
                      <div className="flex items-center justify-between text-sm"><span className="font-medium">{f.format}</span>
                        <div className="flex gap-4 text-right"><span className="text-muted-foreground">{formatNumber(f.totalPots)} pots</span><span className="font-semibold text-primary">{formatNumber(f.totalQty)} colis</span><span className="text-muted-foreground w-12">{pct.toFixed(1)}%</span></div>
                      </div>
                      <div className="h-3 bg-muted rounded-full overflow-hidden"><div className="h-full bg-[#3674b5] rounded-full" style={{ width: `${(f.totalQty / max) * 100}%` }} /></div>
                    </div> ); })}
                </div></CardContent>
              </Card>

              {!stats.filteredEnseigne && stats.topEnseignes.length > 0 && (
                <Card className="border-border"><CardHeader><CardTitle className="font-title">Top clients par volume</CardTitle></CardHeader>
                  <CardContent><div className="space-y-2 max-h-60 overflow-y-auto">
                    {stats.topEnseignes.map((e, idx) => { const max = stats.topEnseignes[0]?.totalQty || 1; return (
                      <div key={e.enseigne} className="space-y-1">
                        <div className="flex items-center justify-between text-sm"><span className="font-medium truncate"><span className="text-muted-foreground mr-1.5">{idx + 1}.</span>{e.enseigne}</span>
                          <div className="flex gap-3 text-right shrink-0"><span className="text-muted-foreground">{formatNumber(e.totalPots)} pots</span><span className="font-semibold text-primary">{formatNumber(e.totalQty)} colis</span></div>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${(e.totalQty / max) * 100}%` }} /></div>
                      </div> ); })}
                  </div></CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card className="border-border"><CardContent className="p-12 text-center"><Package className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-40" /><p className="text-sm text-muted-foreground mb-2">Aucune donnée de volume disponible.</p><p className="text-xs text-muted-foreground">Importez le fichier "Analyse Factures Clients" pour voir les stats.</p></CardContent></Card>
          )}
        </main>
      </div>
    </div>
  );
}

function VolumesImportButton({ onImported }: { onImported: () => void }) {
  const [loading, setLoading] = useState(false);
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return; setLoading(true);
    try { const formData = new FormData(); formData.append('file', file); const res = await fetch('/api/volumes/import', { method: 'POST', body: formData }); const json = await res.json(); if (!json.ok) throw new Error(json.error); toast.success('Import réussi', { description: json.detail }); onImported(); }
    catch (e: any) { toast.error('Erreur d\'import', { description: e.message }); } finally { setLoading(false); }
  };
  if (loading) return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
  return (<><Button size="sm" onClick={() => document.getElementById('volumes-import-input')?.click()} className="bg-primary text-primary-foreground hover:bg-primary/90"><Upload className="h-4 w-4 mr-2" /> Importer</Button><input id="volumes-import-input" type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} /></>);
}
