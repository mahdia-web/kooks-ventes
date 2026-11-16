'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, Package, Upload, Search, TrendingUp, ShoppingCart, Euro, Percent, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { AppSidebar } from '@/components/app-sidebar';
import { SettingsPanel } from '@/components/settings-panel';
import type { DashboardData } from '@/lib/dashboard-types';
import { formatEuro, formatNumber } from '@/lib/dashboard-service';

interface ClientAnalysisRow {
  enseigne: string;
  variants: string[];
  colisCommandes: number;
  potsCommandes: number;
  caHT: number;
  prixVenteMoyenParPot: number;
  prixVenteMoyenParColis: number;
  nbBL: number;
  panierMoyenBL: number;
  referencesProduits: number;
  nbParfums: number;
  nbFormats: number;
  lignes: number;
}

interface ProductFormatRow {
  productLabel: string;
  parfum: string | null;
  format: string | null;
  colis: number;
  pots: number;
  caHT: number;
  prixMoyenParPot: number;
  prixMoyenParColis: number;
  lignes: number;
}

interface MonthlyRow {
  year: number;
  month: number;
  colis: number;
  caHT: number;
  label: string;
}

interface Totals {
  nbClients: number;
  totalColis: number;
  totalPots: number;
  totalCA: number;
  totalBL: number;
  colisMoyenParMois: number;
  caMoyenParMois: number;
  nbMois: number;
  prixMoyenGlobalParPot: number;
}

interface PreviousPeriod {
  caHT: number;
  colis: number;
  nbBL: number;
  prixMoyenParPot: number;
  colisMoyenParMois: number;
  nbMois: number;
}

interface Evolutions {
  caHTPercent: number;
  colisPercent: number;
  nbBLPercent: number;
  prixMoyenParPotPercent: number;
  colisMoyenParMoisPercent: number;
}

type SortKey = 'enseigne' | 'colisCommandes' | 'caHT' | 'prixVenteMoyenParPot' | 'referencesProduits' | 'nbBL' | 'panierMoyenBL';
type SortDir = 'asc' | 'desc';

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

export default function VolumesPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [clients, setClients] = useState<ClientAnalysisRow[]>([]);
  const [prixParProduitFormat, setPrixParProduitFormat] = useState<ProductFormatRow[]>([]);
  const [monthlySeries, setMonthlySeries] = useState<MonthlyRow[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [previousPeriod, setPreviousPeriod] = useState<PreviousPeriod | null>(null);
  const [evolutions, setEvolutions] = useState<Evolutions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('caHT');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [defaultDate, setDefaultDate] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ ok: boolean; message: string; detail?: unknown } | null>(null);

  // Filtre période
  const [filterMode, setFilterMode] = useState<'all' | 'month' | 'range'>('all');
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');

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

  const buildQuery = useCallback(() => {
    if (filterMode === 'month') return `year=${filterYear}&month=${filterMonth}`;
    if (filterMode === 'range' && filterStart && filterEnd) return `startDate=${encodeURIComponent(filterStart)}&endDate=${encodeURIComponent(filterEnd)}`;
    return '';
  }, [filterMode, filterYear, filterMonth, filterStart, filterEnd]);

  const loadAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = buildQuery();
      const url = `/api/volumes/clients-analysis${q ? `?${q}` : ''}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.ok) {
        setClients(json.data.clients);
        setTotals(json.data.totals);
        setPrixParProduitFormat(json.data.prixParProduitFormat ?? []);
        setMonthlySeries(json.data.monthlySeries ?? []);
        setPreviousPeriod(json.data.previousPeriod ?? null);
        setEvolutions(json.data.evolutions ?? null);
      } else {
        setError(json.error || 'Erreur de chargement');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur réseau');
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  useEffect(() => { loadAnalysis(); }, [loadAnalysis]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      if (defaultDate) formData.append('defaultDate', defaultDate);
      const res = await fetch('/api/volumes/import', { method: 'POST', body: formData });
      const json = await res.json();
      if (json.ok) {
        setImportResult({
          ok: true,
          message: `Import réussi : ${json.result.inserted} ligne(s) insérée(s), ${json.result.skipped} ignorée(s) sur ${json.result.total} total.`,
          detail: json.columnMapping,
        });
        loadAnalysis();
      } else {
        setImportResult({ ok: false, message: json.error || 'Erreur d\'import' });
      }
    } catch (e) {
      setImportResult({ ok: false, message: e instanceof Error ? e.message : 'Erreur réseau' });
    } finally {
      setImporting(false);
    }
  };

  const filteredClients = clients.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.enseigne.toLowerCase().includes(q) || c.variants.some((v) => v.toLowerCase().includes(q));
  });

  const sortedClients = [...filteredClients].sort((a, b) => {
    const av = a[sortKey]; const bv = b[sortKey];
    if (typeof av === 'string' && typeof bv === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    const an = Number(av) || 0; const bn = Number(bv) || 0;
    return sortDir === 'asc' ? an - bn : bn - an;
  });

  const handleHome = () => { window.location.href = '/'; };
  const sortArrow = (key: SortKey) => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  // Badge d'évolution vs période précédente
  const EvolutionBadge = ({ pct }: { pct: number }) => {
    if (pct === 0 || !isFinite(pct)) return <span className="inline-flex items-center text-xs text-muted-foreground"><Minus className="h-3 w-3 mr-0.5" />N/A</span>;
    const positive = pct > 0;
    return (
      <span className={`inline-flex items-center text-xs font-medium ${positive ? 'text-emerald-600' : 'text-red-600'}`}>
        {positive ? <ArrowUp className="h-3 w-3 mr-0.5" /> : <ArrowDown className="h-3 w-3 mr-0.5" />}
        {Math.abs(pct).toFixed(1)}%
      </span>
    );
  };

  const periodLabel = filterMode === 'all' ? 'toute la période'
    : filterMode === 'month' ? `${MONTHS[filterMonth - 1]} ${filterYear}`
    : filterMode === 'range' ? `${filterStart} → ${filterEnd}` : '';

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
                <Package className="h-5 w-5 text-primary" />
                <h1 className="font-title text-lg font-bold">Volumes clients</h1>
              </div>
            </div>
            <Dialog open={importOpen} onOpenChange={setImportOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Upload className="h-4 w-4 mr-2" />
                  Importer un fichier
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Importer des données de volumes</DialogTitle>
                  <DialogDescription>
                    Fichier Excel d'export ERP (Référence, Client, Produit, Colis, Nb. Colis, Pièces, PU, Total HT).
                    Les données vont dans la table VolumeSale (colis, prix, références) sans toucher au CA de la table Sale.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label htmlFor="file">Fichier Excel</Label>
                    <Input id="file" type="file" accept=".xlsx,.xls" onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="date">Date par défaut (si le fichier n'a pas de colonne Date)</Label>
                    <Input id="date" type="text" placeholder="JJ/MM/AAAA — ex: 31/10/2026" value={defaultDate} onChange={(e) => setDefaultDate(e.target.value)} />
                    <p className="text-xs text-muted-foreground">
                      Si le fichier n'a pas de colonne Date (ex: export ERP avec uniquement des numéros de BL),
                      toutes les lignes auront cette date. Laisser vide = date du jour.
                    </p>
                  </div>
                  {importResult && (
                    <Alert variant={importResult.ok ? 'default' : 'destructive'}>
                      <AlertDescription>{importResult.message}</AlertDescription>
                    </Alert>
                  )}
                </div>
                <DialogFooter>
                  <Button onClick={handleImport} disabled={!importFile || importing}>
                    {importing ? 'Import en cours…' : 'Importer'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Filtre période */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Filtre période</CardTitle>
              <CardDescription>
                Sélectionne une période pour voir la performance et la comparaison vs période précédente.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex gap-1">
                  <Button size="sm" variant={filterMode === 'all' ? 'default' : 'outline'} onClick={() => setFilterMode('all')}>Tout</Button>
                  <Button size="sm" variant={filterMode === 'month' ? 'default' : 'outline'} onClick={() => setFilterMode('month')}>Mois</Button>
                  <Button size="sm" variant={filterMode === 'range' ? 'default' : 'outline'} onClick={() => setFilterMode('range')}>Plage</Button>
                </div>
                {filterMode === 'month' && (
                  <>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Mois</Label>
                      <select className="border rounded px-2 py-1 text-sm" value={filterMonth} onChange={(e) => setFilterMonth(parseInt(e.target.value))}>
                        {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Année</Label>
                      <Input type="number" className="w-24" value={filterYear} onChange={(e) => setFilterYear(parseInt(e.target.value) || new Date().getFullYear())} />
                    </div>
                  </>
                )}
                {filterMode === 'range' && (
                  <>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Début (JJ/MM/AAAA)</Label>
                      <Input className="w-40" placeholder="01/10/2026" value={filterStart} onChange={(e) => setFilterStart(e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Fin (JJ/MM/AAAA)</Label>
                      <Input className="w-40" placeholder="31/10/2026" value={filterEnd} onChange={(e) => setFilterEnd(e.target.value)} />
                    </div>
                  </>
                )}
                <Button size="sm" variant="ghost" onClick={() => { setFilterMode('all'); setFilterStart(''); setFilterEnd(''); }}>Réinitialiser</Button>
                <span className="text-sm text-muted-foreground ml-auto">
                  Période : <span className="font-medium text-foreground">{periodLabel}</span>
                </span>
              </div>
            </CardContent>
          </Card>

          {/* KPIs globaux avec comparaison N-1 */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <ShoppingCart className="h-3.5 w-3.5" /> Colis commandés
                </CardDescription>
                <CardTitle className="text-2xl font-title">{totals ? formatNumber(totals.totalColis) : '—'}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">{totals ? `${formatNumber(totals.totalBL)} BL • ${formatNumber(totals.totalPots)} pots` : ''}</p>
                  {evolutions && <EvolutionBadge pct={evolutions.colisPercent} />}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Euro className="h-3.5 w-3.5" /> CA HT (volumes)
                </CardDescription>
                <CardTitle className="text-2xl font-title">{totals ? formatEuro(totals.totalCA) : '—'}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Calculé depuis les volumes importés (≠ table Sale)</p>
                  {evolutions && <EvolutionBadge pct={evolutions.caHTPercent} />}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Percent className="h-3.5 w-3.5" /> Prix vente moyen / pot
                </CardDescription>
                <CardTitle className="text-2xl font-title">{totals ? formatEuro(totals.prixMoyenGlobalParPot) : '—'}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Moyenne pondérée (CA HT ÷ pots)</p>
                  {evolutions && <EvolutionBadge pct={evolutions.prixMoyenParPotPercent} />}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <TrendingUp className="h-3.5 w-3.5" /> Colis moyen / mois
                </CardDescription>
                <CardTitle className="text-2xl font-title">{totals ? formatNumber(totals.colisMoyenParMois) : '—'}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">{totals ? `sur ${totals.nbMois} mois • CA moy. ${formatEuro(totals.caMoyenParMois)}` : ''}</p>
                  {evolutions && <EvolutionBadge pct={evolutions.colisMoyenParMoisPercent} />}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Détail période précédente (si comparaison active) */}
          {previousPeriod && evolutions && (
            <Alert>
              <AlertDescription className="text-xs">
                <strong>Comparaison vs période précédente</strong> ({previousPeriod.nbMois} mois) :
                CA <span className="font-mono">{formatEuro(previousPeriod.caHT)}</span>,
                colis <span className="font-mono">{formatNumber(previousPeriod.colis)}</span>,
                BL <span className="font-mono">{formatNumber(previousPeriod.nbBL)}</span>,
                prix moyen/pot <span className="font-mono">{formatEuro(previousPeriod.prixMoyenParPot)}</span>,
                colis moyen/mois <span className="font-mono">{formatNumber(previousPeriod.colisMoyenParMois)}</span>.
              </AlertDescription>
            </Alert>
          )}

          {/* Prix moyen par produit × format (visible en premier) */}
          <Card>
            <CardHeader>
              <CardTitle className="font-title">Prix de vente unitaire moyen par produit × format</CardTitle>
              <CardDescription>
                Prix auquel on vend chaque combinaison produit × format sur la période filtrée.
                Calculé comme CA HT ÷ pots (ou colis).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {prixParProduitFormat.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Aucune donnée pour cette période.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produit</TableHead>
                        <TableHead>Parfum</TableHead>
                        <TableHead>Format</TableHead>
                        <TableHead className="text-right">Colis</TableHead>
                        <TableHead className="text-right">Pots</TableHead>
                        <TableHead className="text-right">CA HT</TableHead>
                        <TableHead className="text-right">Prix moy./pot</TableHead>
                        <TableHead className="text-right">Prix moy./colis</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {prixParProduitFormat.map((p) => (
                        <TableRow key={`${p.productLabel}-${p.format}`} className="hover:bg-muted/40">
                          <TableCell className="font-medium text-xs">{p.productLabel}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{p.parfum ?? '—'}</TableCell>
                          <TableCell className="text-xs">{p.format ?? '—'}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{formatNumber(p.colis)}</TableCell>
                          <TableCell className="text-right font-mono text-xs text-muted-foreground">{formatNumber(p.pots)}</TableCell>
                          <TableCell className="text-right font-mono text-xs font-semibold text-emerald-700">{formatEuro(p.caHT)}</TableCell>
                          <TableCell className="text-right font-mono text-xs font-semibold">{formatEuro(p.prixMoyenParPot)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{formatEuro(p.prixMoyenParColis)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Colis par mois */}
          <Card>
            <CardHeader>
              <CardTitle className="font-title">Colis par mois</CardTitle>
              <CardDescription>
                Évolution mensuelle des colis commandés sur la période filtrée.
                Moyenne = {totals ? `${formatNumber(totals.colisMoyenParMois)} colis/mois` : '—'} sur {totals ? totals.nbMois : 0} mois.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {monthlySeries.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Aucune donnée pour cette période.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Mois</TableHead>
                        <TableHead className="text-right">Colis</TableHead>
                        <TableHead className="text-right">CA HT</TableHead>
                        <TableHead className="text-right">Colis / jour (moy.)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {monthlySeries.map((m) => (
                        <TableRow key={m.label} className="hover:bg-muted/40">
                          <TableCell className="font-medium">{m.label}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{formatNumber(m.colis)}</TableCell>
                          <TableCell className="text-right font-mono text-xs text-emerald-700">{formatEuro(m.caHT)}</TableCell>
                          <TableCell className="text-right font-mono text-xs text-muted-foreground">{formatNumber(Math.round(m.colis / 30))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Détail par client */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Rechercher un client…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <p className="text-sm text-muted-foreground">
                {filteredClients.length} client(s) affiché(s){search && ` sur ${clients.length}`}
              </p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="font-title">Détail par client</CardTitle>
                <CardDescription>Performance de chaque enseigne sur la période filtrée.</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Chargement…</p>
                ) : sortedClients.length === 0 ? (
                  <div className="py-12 text-center">
                    <Package className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground">Aucune donnée pour cette période. Importez un fichier ou changez le filtre.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('enseigne')}>Client{sortArrow('enseigne')}</TableHead>
                          <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => handleSort('nbBL')}>BL{sortArrow('nbBL')}</TableHead>
                          <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => handleSort('colisCommandes')}>Colis{sortArrow('colisCommandes')}</TableHead>
                          <TableHead className="text-right">Pots</TableHead>
                          <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => handleSort('caHT')}>CA HT{sortArrow('caHT')}</TableHead>
                          <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => handleSort('prixVenteMoyenParPot')}>Prix moy./pot{sortArrow('prixVenteMoyenParPot')}</TableHead>
                          <TableHead className="text-right">Prix moy./colis</TableHead>
                          <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => handleSort('panierMoyenBL')}>Panier moy./BL{sortArrow('panierMoyenBL')}</TableHead>
                          <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => handleSort('referencesProduits')}>Réf. produits{sortArrow('referencesProduits')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedClients.map((c) => (
                          <TableRow key={c.enseigne} className="hover:bg-muted/40">
                            <TableCell className="font-medium">
                              {c.enseigne}
                              {c.variants.length > 1 && <span className="ml-2 text-[10px] text-muted-foreground">({c.variants.length} variants)</span>}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">{c.nbBL}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{formatNumber(c.colisCommandes)}</TableCell>
                            <TableCell className="text-right font-mono text-xs text-muted-foreground">{formatNumber(c.potsCommandes)}</TableCell>
                            <TableCell className="text-right font-mono text-xs font-semibold text-emerald-700">{formatEuro(c.caHT)}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{formatEuro(c.prixVenteMoyenParPot)}</TableCell>
                            <TableCell className="text-right font-mono text-xs text-muted-foreground">{formatEuro(c.prixVenteMoyenParColis)}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{formatEuro(c.panierMoyenBL)}</TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              <span className="inline-flex items-center gap-1">
                                {c.referencesProduits}
                                <span className="text-[10px] text-muted-foreground">({c.nbParfums} parfums)</span>
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
      <SettingsPanel />
    </div>
  );
}
