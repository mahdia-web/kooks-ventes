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
import { ArrowLeft, Package, Upload, Search, TrendingUp, ShoppingCart, Euro, Percent } from 'lucide-react';
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

interface Totals {
  nbClients: number;
  totalColis: number;
  totalPots: number;
  totalCA: number;
  totalBL: number;
  totalReferences: number;
  totalPrixMoyenParPot: number;
}

type SortKey = 'enseigne' | 'colisCommandes' | 'caHT' | 'prixVenteMoyenParPot' | 'referencesProduits' | 'nbBL' | 'panierMoyenBL';
type SortDir = 'asc' | 'desc';

export default function VolumesPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [clients, setClients] = useState<ClientAnalysisRow[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
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

  const loadAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Pas de filtre year/month par défaut : on charge TOUTES les données de volumes
      // (le fichier ERP ne contient pas de date, on veut donc voir l'ensemble)
      const res = await fetch('/api/volumes/clients-analysis');
      const json = await res.json();
      if (json.ok) {
        setClients(json.data.clients);
        setTotals(json.data.totals);
      } else {
        setError(json.error || 'Erreur de chargement');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur réseau');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDashboard(); loadAnalysis(); }, [loadDashboard, loadAnalysis]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
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
        // Recharge les données
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

  // Filtre + tri
  const filteredClients = clients.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.enseigne.toLowerCase().includes(q) ||
      c.variants.some((v) => v.toLowerCase().includes(q));
  });

  const sortedClients = [...filteredClients].sort((a, b) => {
    let av: string | number = a[sortKey];
    let bv: string | number = b[sortKey];
    if (typeof av === 'string' && typeof bv === 'string') {
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    const an = Number(av) || 0;
    const bn = Number(bv) || 0;
    return sortDir === 'asc' ? an - bn : bn - an;
  });

  const handleHome = () => { window.location.href = '/'; };
  const sortArrow = (key: SortKey) => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

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
                    <Input
                      id="file"
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="date">Date par défaut (si le fichier n'a pas de colonne Date)</Label>
                    <Input
                      id="date"
                      type="text"
                      placeholder="JJ/MM/AAAA — ex: 31/10/2026"
                      value={defaultDate}
                      onChange={(e) => setDefaultDate(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Si le fichier n'a pas de colonne Date (ex: export ERP avec uniquement des numéros de BL),
                      toutes les lignes auront cette date. Laisser vide = date du jour.
                    </p>
                  </div>
                  {importResult && (
                    <Alert variant={importResult.ok ? 'default' : 'destructive'}>
                      <AlertDescription>
                        {importResult.message}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
                <DialogFooter>
                  <Button
                    onClick={handleImport}
                    disabled={!importFile || importing}
                  >
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

          {/* KPIs globaux */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <ShoppingCart className="h-3.5 w-3.5" /> Colis commandés
                </CardDescription>
                <CardTitle className="text-2xl font-title">
                  {totals ? formatNumber(totals.totalColis) : '—'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {totals ? `${formatNumber(totals.totalPots)} pots • ${formatNumber(totals.totalBL)} BL` : ''}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Euro className="h-3.5 w-3.5" /> CA HT (volumes)
                </CardDescription>
                <CardTitle className="text-2xl font-title">
                  {totals ? formatEuro(totals.totalCA) : '—'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Calculé depuis les volumes importés (≠ table Sale)
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Percent className="h-3.5 w-3.5" /> Prix vente moyen / pot
                </CardDescription>
                <CardTitle className="text-2xl font-title">
                  {totals ? formatEuro(totals.totalPrixMoyenParPot) : '—'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Moyenne pondérée (CA HT ÷ nb pots)
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <TrendingUp className="h-3.5 w-3.5" /> Clients actifs
                </CardDescription>
                <CardTitle className="text-2xl font-title">
                  {totals ? formatNumber(totals.nbClients) : '—'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {totals ? `sur ${formatNumber(totals.totalBL)} BL` : ''}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Filtre recherche */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher un client…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {filteredClients.length} client(s) affiché(s)
              {search && ` sur ${clients.length}`}
            </p>
          </div>

          {/* Tableau par client */}
          <Card>
            <CardHeader>
              <CardTitle className="font-title">Détail par client</CardTitle>
              <CardDescription>
                Cliquez sur un en-tête pour trier. Prix moyen pondéré par pot = CA HT ÷ nb pots.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Chargement…</p>
              ) : sortedClients.length === 0 ? (
                <div className="py-12 text-center">
                  <Package className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    Aucune donnée de volume. Importez un fichier Excel via le bouton ci-dessus.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => handleSort('enseigne')}
                        >
                          Client{sortArrow('enseigne')}
                        </TableHead>
                        <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => handleSort('nbBL')}>
                          BL{sortArrow('nbBL')}
                        </TableHead>
                        <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => handleSort('colisCommandes')}>
                          Colis{sortArrow('colisCommandes')}
                        </TableHead>
                        <TableHead className="text-right">Pots</TableHead>
                        <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => handleSort('caHT')}>
                          CA HT{sortArrow('caHT')}
                        </TableHead>
                        <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => handleSort('prixVenteMoyenParPot')}>
                          Prix moy./pot{sortArrow('prixVenteMoyenParPot')}
                        </TableHead>
                        <TableHead className="text-right">Prix moy./colis</TableHead>
                        <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => handleSort('panierMoyenBL')}>
                          Panier moy./BL{sortArrow('panierMoyenBL')}
                        </TableHead>
                        <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => handleSort('referencesProduits')}>
                          Réf. produits{sortArrow('referencesProduits')}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedClients.map((c) => (
                        <TableRow key={c.enseigne} className="hover:bg-muted/40">
                          <TableCell className="font-medium">
                            {c.enseigne}
                            {c.variants.length > 1 && (
                              <span className="ml-2 text-[10px] text-muted-foreground">
                                ({c.variants.length} variants)
                              </span>
                            )}
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
                              <span className="text-[10px] text-muted-foreground">
                                ({c.nbParfums} parfums)
                              </span>
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
        </main>
      </div>
      <SettingsPanel />
    </div>
  );
}
