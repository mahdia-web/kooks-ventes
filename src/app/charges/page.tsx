'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ArrowLeft, Receipt, Upload, Loader2, Trash2, Euro, Truck, Search, Plus, Building2,
  TrendingUp, TrendingDown, Wallet, FileText, PieChart as PieIcon, Award, AlertTriangle,
  Lightbulb, Target, ArrowUpRight, ArrowDownRight, X, ChevronDown, ChevronUp,
} from 'lucide-react';
import { AppSidebar } from '@/components/app-sidebar';
import { DateRangeFilter } from '@/components/date-range-filter';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import type { DashboardData } from '@/lib/dashboard-types';
import { formatNumber, formatEuro, formatDate, formatPercent } from '@/lib/dashboard-service';
import { toast } from 'sonner';
import {
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip,
} from 'recharts';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

interface Charge {
  id: string;
  date: string;
  month: number;
  year: number;
  category: string;
  subLabel: string | null;
  vendor: string | null;
  amountHT: number;
  amountTTC: number;
  enseigne: string | null;
  allocationMethod: string;
  source: string;
  blNumber?: string | null;
}

interface TopVendor {
  vendor: string;
  totalHT: number;
  totalTTC: number;
  count: number;
  category: string;
  pct: number;
}

interface TopCategory {
  category: string;
  total: number;
  count: number;
  pct: number;
}

interface PreviousPeriod {
  totalHT: number;
  totalTTC: number;
  nbCharges: number;
  directHT: number;
  variationHT: number;
  variationPct: number;
  variationTTC: number;
  variationNb: number;
}

interface MarginPreview {
  caHT: number;
  chargesHT: number;
  margeBrute: number;
  margePct: number;
  nbVentes: number;
}

const COLORS = ['#f7a941', '#3674b5', '#bb7e40', '#a6d6c9', '#e30613', '#ffe111', '#ca8a04', '#db2777', '#6366f1', '#14b8a6'];

// Variant sign formatter
const fmtVar = (n: number, isEuro = true) => {
  const sign = n > 0 ? '+' : '';
  const v = isEuro ? formatEuro(n) : formatNumber(n);
  return `${sign}${v}`;
};

const fmtPct = (n: number) => {
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
};

export default function ChargesPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [topVendors, setTopVendors] = useState<TopVendor[]>([]);
  const [topCategories, setTopCategories] = useState<TopCategory[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [vendors, setVendors] = useState<string[]>([]);
  const [enseignes, setEnseignes] = useState<string[]>([]);
  const [previousPeriod, setPreviousPeriod] = useState<PreviousPeriod | null>(null);
  const [marginPreview, setMarginPreview] = useState<MarginPreview | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterVendor, setFilterVendor] = useState<string>('all');
  const [filterEnseigne, setFilterEnseigne] = useState<string>('all');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });

  // Sort
  const [sortField, setSortField] = useState<'date' | 'vendor' | 'category' | 'amountHT' | 'amountTTC'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Selected charge for drawer
  const [selectedCharge, setSelectedCharge] = useState<Charge | null>(null);

  // Add form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCharge, setNewCharge] = useState({
    date: '', category: 'Achats matières premières', subLabel: '', vendor: '', amountHT: '', enseigne: '',
  });

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

  const loadCharges = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterCategory !== 'all') params.set('category', filterCategory);
      if (filterVendor !== 'all') params.set('vendor', filterVendor);
      if (filterEnseigne !== 'all') params.set('enseigne', filterEnseigne);
      if (dateRange.start && dateRange.end) {
        params.set('startDate', dateRange.start);
        params.set('endDate', dateRange.end);
      }
      const url = `/api/charges${params.toString() ? '?' + params.toString() : ''}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.ok) {
        setCharges(json.data);
        setTopVendors(json.topVendors || []);
        setTopCategories(json.topCategories || []);
        setCategories(json.categories || []);
        setVendors(json.vendors || []);
        setEnseignes(json.enseignes || []);
        setPreviousPeriod(json.previousPeriod ?? null);
        setMarginPreview(json.marginPreview ?? null);
      }
    } catch {}
    setLoading(false);
  }, [filterCategory, filterVendor, filterEnseigne, dateRange]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  useEffect(() => { loadCharges(); }, [loadCharges]);

  const handleHome = () => { window.location.href = '/'; };

  // Filtered charges (after client-side search)
  const filtered = useMemo(() => {
    let list = charges;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.category.toLowerCase().includes(q) ||
        (c.subLabel ?? '').toLowerCase().includes(q) ||
        (c.vendor ?? '').toLowerCase().includes(q) ||
        (c.enseigne ?? '').toLowerCase().includes(q)
      );
    }
    // Sort
    list = [...list].sort((a, b) => {
      let av: string | number, bv: string | number;
      if (sortField === 'date') { av = a.date; bv = b.date; }
      else if (sortField === 'amountHT') { av = a.amountHT; bv = b.amountHT; }
      else if (sortField === 'amountTTC') { av = a.amountTTC; bv = b.amountTTC; }
      else { av = (a[sortField] ?? '').toString().toLowerCase(); bv = (b[sortField] ?? '').toString().toLowerCase(); }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [charges, search, sortField, sortDir]);

  // KPIs from filtered charges
  const kpis = useMemo(() => {
    const totalHT = filtered.reduce((s, c) => s + c.amountHT, 0);
    const totalTTC = filtered.reduce((s, c) => s + c.amountTTC, 0);
    const direct = filtered.filter(c => c.allocationMethod === 'DIRECT').reduce((s, c) => s + c.amountHT, 0);
    const indirect = totalHT - direct;
    const distinctVendors = new Set(filtered.map(c => (c.vendor ?? '').trim()).filter(Boolean));
    return {
      totalHT, totalTTC, direct, indirect,
      nbCharges: filtered.length,
      nbVendors: distinctVendors.size,
    };
  }, [filtered]);

  // Pie data: top 10 + "Autres"
  const pieData = useMemo(() => {
    const top10 = topCategories.slice(0, 10);
    const others = topCategories.slice(10);
    const othersSum = others.reduce((s, c) => s + c.total, 0);
    const othersPct = others.reduce((s, c) => s + c.pct, 0);
    if (others.length > 0) {
      return [...top10, { category: `Autres (${others.length})`, total: othersSum, pct: othersPct, count: others.length }];
    }
    return top10;
  }, [topCategories]);

  // Smart analysis cards
  const smartAnalysis = useMemo(() => {
    const cards: Array<{ icon: any; title: string; value: string; sub: string; color: string; bg: string; }> = [];

    // 1. Plus gros poste de dépenses
    if (topCategories.length > 0) {
      const top = topCategories[0];
      cards.push({
        icon: TrendingUp,
        title: 'Plus gros poste de dépenses',
        value: top.category,
        sub: `${formatEuro(top.total)} • ${top.pct.toFixed(1)}% du total`,
        color: '#f7a941',
        bg: 'rgba(247,169,65,0.08)',
      });
    }

    // 2. Fournisseur principal
    if (topVendors.length > 0) {
      const top = topVendors[0];
      cards.push({
        icon: Award,
        title: 'Fournisseur principal',
        value: top.vendor,
        sub: `${formatEuro(top.totalHT)} • ${top.pct.toFixed(1)}% • ${top.count} factures`,
        color: '#3674b5',
        bg: 'rgba(54,116,181,0.08)',
      });
    }

    // 3. Variation vs période précédente
    if (previousPeriod) {
      const isUp = previousPeriod.variationHT > 0;
      cards.push({
        icon: isUp ? TrendingUp : TrendingDown,
        title: 'Variation vs période précédente',
        value: fmtVar(previousPeriod.variationHT),
        sub: `${fmtPct(previousPeriod.variationPct)} • ${fmtVar(previousPeriod.variationNb, false)} factures`,
        color: isUp ? '#e30613' : '#16a34a',
        bg: isUp ? 'rgba(227,6,19,0.08)' : 'rgba(22,163,74,0.08)',
      });
    }

    // 4. Concentration des dépenses
    if (topVendors.length >= 3 && kpis.totalHT > 0) {
      const top3Sum = topVendors.slice(0, 3).reduce((s, v) => s + v.totalHT, 0);
      const concentration = (top3Sum / kpis.totalHT) * 100;
      cards.push({
        icon: AlertTriangle,
        title: 'Concentration des dépenses',
        value: `${concentration.toFixed(1)}%`,
        sub: `Top 3 fournisseurs = ${formatEuro(top3Sum)}`,
        color: concentration > 50 ? '#e30613' : '#bb7e40',
        bg: concentration > 50 ? 'rgba(227,6,19,0.08)' : 'rgba(187,126,64,0.08)',
      });
    }

    // 5. Taux de marge (si marge preview disponible)
    if (marginPreview && marginPreview.caHT > 0) {
      cards.push({
        icon: Target,
        title: 'Taux de marge (période)',
        value: formatPercent(marginPreview.margePct),
        sub: `CA ${formatEuro(marginPreview.caHT)} • Marge ${formatEuro(marginPreview.margeBrute)}`,
        color: marginPreview.margePct >= 30 ? '#16a34a' : (marginPreview.margePct >= 10 ? '#bb7e40' : '#e30613'),
        bg: marginPreview.margePct >= 30 ? 'rgba(22,163,74,0.08)' : (marginPreview.margePct >= 10 ? 'rgba(187,126,64,0.08)' : 'rgba(227,6,19,0.08)'),
      });
    }

    // 6. Économie potentielle (si top fournisseur représente +20% du total)
    if (topVendors.length > 0 && topVendors[0].pct > 20) {
      const top = topVendors[0];
      const potentialSaving = top.totalHT * 0.05; // hypothèse 5% négociation
      cards.push({
        icon: Lightbulb,
        title: 'Économie potentielle (5% sur top fournisseur)',
        value: formatEuro(potentialSaving),
        sub: `Renégocier ${top.vendor} (${top.pct.toFixed(1)}% du total)`,
        color: '#a6d6c9',
        bg: 'rgba(166,214,201,0.15)',
      });
    }

    return cards;
  }, [topCategories, topVendors, previousPeriod, marginPreview, kpis.totalHT]);

  // Export Excel (CSV)
  const handleExport = () => {
    const headers = ['Date', 'Fournisseur', 'Catégorie', 'Client', 'Montant HT', 'Montant TTC', 'Allocation', 'Libellé'];
    const rows = filtered.map(c => [
      formatDate(c.date),
      c.vendor ?? '',
      c.category,
      c.enseigne ?? '',
      c.amountHT.toFixed(2),
      c.amountTTC.toFixed(2),
      c.allocationMethod,
      c.subLabel ?? '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `charges-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Export Excel généré');
  };

  const deleteCharge = async (id: string) => {
    if (!confirm('Supprimer cette charge ?')) return;
    try {
      const res = await fetch(`/api/charges?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      toast.success('Charge supprimée');
      setSelectedCharge(null);
      loadCharges();
    } catch (e: any) { toast.error(e.message); }
  };

  const addChargeManual = async () => {
    if (!newCharge.date || !newCharge.amountHT) {
      toast.error('Date et montant HT requis');
      return;
    }
    try {
      const res = await fetch('/api/charges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: newCharge.date,
          category: newCharge.category,
          subLabel: newCharge.subLabel || null,
          vendor: newCharge.vendor || null,
          amountHT: parseFloat(newCharge.amountHT),
          enseigne: newCharge.enseigne || null,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      toast.success('Charge ajoutée');
      setNewCharge({ date: '', category: 'Achats matières premières', subLabel: '', vendor: '', amountHT: '', enseigne: '' });
      setShowAddForm(false);
      loadCharges();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleImport = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/charges/import', { method: 'POST', body: formData });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Erreur serveur');
      toast.success('Import charges réussi', { description: json.detail });
      loadCharges();
    } catch (e: any) {
      toast.error('Erreur import charges', { description: e.message });
    }
  };

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex">
        <AppSidebar data={data} agentFilter="all" onHome={handleHome} />
        <div className="flex-1 ml-64 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      <AppSidebar data={data} agentFilter="all" onHome={handleHome} />
      <div className="flex-1 ml-64 flex flex-col min-h-screen">

        {/* === HEADER PREMIUM === */}
        <header className="border-b border-border bg-card sticky top-0 z-40">
          <div className="px-4 sm:px-6 lg:px-8 py-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-4">
                <Link href="/">
                  <Button variant="outline" size="sm" className="rounded-lg">
                    <ArrowLeft className="h-4 w-4 mr-2" />Retour
                  </Button>
                </Link>
                <div>
                  <h1 className="font-title text-2xl font-bold tracking-tight">Charges</h1>
                  <p className="text-sm text-muted-foreground">Pilotage et analyse des dépenses opérationnelles</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={handleExport} className="rounded-lg">
                  <FileText className="h-4 w-4 mr-2" /> Export Excel
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowAddForm(!showAddForm)} className="rounded-lg">
                  <Plus className="h-4 w-4 mr-2" /> Ajouter une charge
                </Button>
                <Button size="sm" onClick={() => document.getElementById('charges-import-input')?.click()} className="rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
                  <Upload className="h-4 w-4 mr-2" /> Importer Excel
                </Button>
                <input id="charges-import-input" type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); }} />
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-6 space-y-5">

          {/* === BARRE DE FILTRES STICKY === */}
          <div className="sticky top-[88px] z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-background/95 backdrop-blur-sm border-b border-border">
            <div className="flex items-center gap-2 flex-wrap">
              <DateRangeFilter
                startDate={dateRange.start}
                endDate={dateRange.end}
                onChange={(s, e) => setDateRange({ start: s, end: e })}
                onReset={() => setDateRange({ start: '', end: '' })}
              />
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="h-9 text-sm w-[200px] rounded-lg"><SelectValue placeholder="Toutes catégories" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes catégories</SelectItem>
                  {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              {/* Fournisseur avec recherche (combobox) */}
              <VendorCombobox
                vendors={vendors}
                value={filterVendor}
                onChange={setFilterVendor}
              />
              <Select value={filterEnseigne} onValueChange={setFilterEnseigne}>
                <SelectTrigger className="h-9 text-sm w-[160px] rounded-lg"><SelectValue placeholder="Tous clients" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous clients</SelectItem>
                  {enseignes.slice(0, 100).map((e) => <SelectItem key={e} value={e}>{e.length > 30 ? e.slice(0, 30) + '…' : e}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher (catégorie, libellé, fournisseur, client)..." className="pl-8 h-9 text-sm rounded-lg" />
              </div>
            </div>
          </div>

          {/* === FORM AJOUT MANUEL === */}
          {showAddForm && (
            <Card className="border-primary/30 bg-primary/5 rounded-2xl">
              <CardContent className="p-4 grid gap-3 sm:grid-cols-6 items-end">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Date *</Label>
                  <Input type="date" value={newCharge.date} onChange={(e) => setNewCharge({ ...newCharge, date: e.target.value })} className="h-9 text-sm rounded-lg" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Catégorie</Label>
                  <Select value={newCharge.category} onValueChange={(v) => setNewCharge({ ...newCharge, category: v })}>
                    <SelectTrigger className="h-9 text-sm rounded-lg"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {categories.slice(0, 30).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      <SelectItem value="Achats matières premières">Achats matières premières</SelectItem>
                      <SelectItem value="Transport">Transport</SelectItem>
                      <SelectItem value="Carburant">Carburant</SelectItem>
                      <SelectItem value="Loyer immobilier">Loyer immobilier</SelectItem>
                      <SelectItem value="Honoraires">Honoraires</SelectItem>
                      <SelectItem value="Autres charges">Autres charges</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs font-medium">Libellé</Label>
                  <Input value={newCharge.subLabel} onChange={(e) => setNewCharge({ ...newCharge, subLabel: e.target.value })} placeholder="Ex: Livraison Auchan" className="h-9 text-sm rounded-lg" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Fournisseur</Label>
                  <Input value={newCharge.vendor} onChange={(e) => setNewCharge({ ...newCharge, vendor: e.target.value })} placeholder="Optionnel" className="h-9 text-sm rounded-lg" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Montant HT € *</Label>
                  <div className="flex gap-2">
                    <Input type="number" step="0.01" value={newCharge.amountHT} onChange={(e) => setNewCharge({ ...newCharge, amountHT: e.target.value })} placeholder="0.00" className="h-9 text-sm rounded-lg" />
                    <Button size="sm" onClick={addChargeManual} className="bg-primary text-primary-foreground hover:bg-primary/90 h-9 rounded-lg">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* === SECTION MARGE (PRIORITÉ ÉLEVÉE) === */}
          {marginPreview && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="rounded-2xl border-emerald-500/30 bg-emerald-500/5 shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Chiffre d'affaires HT</p>
                    <Wallet className="h-4 w-4 text-emerald-500" />
                  </div>
                  <p className="text-2xl font-title font-bold text-emerald-600">{formatEuro(marginPreview.caHT)}</p>
                  <p className="text-xs text-muted-foreground mt-1">{formatNumber(marginPreview.nbVentes)} ventes sur la période</p>
                </CardContent>
              </Card>
              <Card className="rounded-2xl border-destructive/30 bg-destructive/5 shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Charges HT</p>
                    <Receipt className="h-4 w-4 text-destructive" />
                  </div>
                  <p className="text-2xl font-title font-bold text-destructive">{formatEuro(marginPreview.chargesHT)}</p>
                  <p className="text-xs text-muted-foreground mt-1">{formatNumber(kpis.nbCharges)} lignes de charges</p>
                </CardContent>
              </Card>
              <Card className={`rounded-2xl shadow-sm ${marginPreview.margeBrute >= 0 ? 'border-primary/30 bg-primary/5' : 'border-destructive/30 bg-destructive/5'}`}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Marge brute</p>
                    {marginPreview.margeBrute >= 0 ? <TrendingUp className="h-4 w-4 text-primary" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
                  </div>
                  <p className={`text-2xl font-title font-bold ${marginPreview.margeBrute >= 0 ? 'text-primary' : 'text-destructive'}`}>
                    {marginPreview.margeBrute >= 0 ? '+' : ''}{formatEuro(marginPreview.margeBrute)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">CA − charges directes et globales</p>
                </CardContent>
              </Card>
              <Card className="rounded-2xl shadow-sm border-border">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Taux de marge</p>
                    <Target className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className={`text-2xl font-title font-bold ${marginPreview.margePct >= 30 ? 'text-emerald-600' : (marginPreview.margePct >= 10 ? 'text-amber-500' : 'text-destructive')}`}>
                    {formatPercent(marginPreview.margePct)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Indicateur stratégique de rentabilité</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* === 6 KPI PRINCIPAUX === */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {/* Total Charges HT */}
            <Card className="rounded-2xl shadow-sm border-border hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Total Charges HT</p>
                  <Euro className="h-3.5 w-3.5 text-primary" />
                </div>
                <p className="text-xl font-title font-bold text-primary">{formatEuro(kpis.totalHT)}</p>
                {previousPeriod && (
                  <p className={`text-[10px] mt-1 flex items-center gap-1 ${previousPeriod.variationHT >= 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                    {previousPeriod.variationHT >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {fmtVar(previousPeriod.variationHT)} ({fmtPct(previousPeriod.variationPct)})
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Total Charges TTC */}
            <Card className="rounded-2xl shadow-sm border-border hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Total Charges TTC</p>
                  <Euro className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <p className="text-xl font-title font-bold">{formatEuro(kpis.totalTTC)}</p>
                {previousPeriod && (
                  <p className={`text-[10px] mt-1 ${previousPeriod.variationTTC >= 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                    {fmtVar(previousPeriod.variationTTC)}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Charges Directes */}
            <Card className="rounded-2xl shadow-sm border-border hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Charges Directes</p>
                  <Building2 className="h-3.5 w-3.5" style={{ color: '#3674b5' }} />
                </div>
                <p className="text-xl font-title font-bold" style={{ color: '#3674b5' }}>{formatEuro(kpis.direct)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {kpis.totalHT > 0 ? `${(kpis.direct / kpis.totalHT * 100).toFixed(1)}% du total` : '—'}
                </p>
              </CardContent>
            </Card>

            {/* Charges Indirectes */}
            <Card className="rounded-2xl shadow-sm border-border hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Charges Indirectes</p>
                  <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <p className="text-xl font-title font-bold" style={{ color: '#bb7e40' }}>{formatEuro(kpis.indirect)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {kpis.totalHT > 0 ? `${(kpis.indirect / kpis.totalHT * 100).toFixed(1)}% du total` : '—'}
                </p>
              </CardContent>
            </Card>

            {/* Nombre de Fournisseurs */}
            <Card className="rounded-2xl shadow-sm border-border hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Nb Fournisseurs</p>
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <p className="text-xl font-title font-bold">{formatNumber(kpis.nbVendors)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">fournisseurs distincts</p>
              </CardContent>
            </Card>

            {/* Nombre de Charges */}
            <Card className="rounded-2xl shadow-sm border-border hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Nb Charges</p>
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <p className="text-xl font-title font-bold">{formatNumber(kpis.nbCharges)}</p>
                {previousPeriod && (
                  <p className={`text-[10px] mt-1 ${previousPeriod.variationNb >= 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                    {fmtVar(previousPeriod.variationNb, false)}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* === ANALYSE VISUELLE (2 COLONNES) === */}
          {topCategories.length > 0 && (
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Colonne gauche: Donut */}
              <Card className="rounded-2xl shadow-sm border-border">
                <CardHeader>
                  <CardTitle className="font-title flex items-center gap-2"><PieIcon className="h-5 w-5 text-primary" /> Répartition des charges</CardTitle>
                  <CardDescription>Ventilation HT — top 10 catégories + autres regroupés</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          dataKey="total"
                          nameKey="category"
                          cx="50%"
                          cy="50%"
                          outerRadius={110}
                          innerRadius={55}
                          paddingAngle={2}
                        >
                          {pieData.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                        </Pie>
                        <Tooltip
                          contentStyle={{ backgroundColor: '#fffaf0', border: '1px solid #e8d6a4', borderRadius: '8px', fontSize: '12px' }}
                          formatter={(v: number, name: string) => [formatEuro(v), name]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Colonne droite: Classement catégories */}
              <Card className="rounded-2xl shadow-sm border-border">
                <CardHeader>
                  <CardTitle className="font-title text-base">Classement des catégories</CardTitle>
                  <CardDescription>Top {Math.min(10, topCategories.length)} postes de dépenses</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {topCategories.slice(0, 10).map((c, idx) => {
                      const max = topCategories[0]?.total || 1;
                      const color = COLORS[idx % COLORS.length];
                      return (
                        <div key={c.category} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium truncate flex-1">
                              <span className="text-muted-foreground mr-2">{idx + 1}.</span>
                              {c.category}
                            </span>
                            <div className="flex gap-3 text-right shrink-0">
                              <span className="font-semibold" style={{ color }}>{formatEuro(c.total)}</span>
                              <span className="text-muted-foreground w-12 text-right">{c.pct.toFixed(1)}%</span>
                            </div>
                          </div>
                          <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${(c.total / max) * 100}%`, backgroundColor: color }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* === TOP FOURNISSEURS === */}
          {topVendors.length > 0 && (
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Podium top 3 */}
              <Card className="rounded-2xl shadow-sm border-border">
                <CardHeader>
                  <CardTitle className="font-title flex items-center gap-2"><Award className="h-5 w-5 text-primary" /> Top fournisseurs par montant</CardTitle>
                  <CardDescription>Les 3 fournisseurs qui pèsent le plus dans les dépenses</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {topVendors.slice(0, 3).map((v, idx) => {
                      const medals = ['🥇', '🥈', '🥉'];
                      const colors = ['#f7a941', '#bb7e40', '#a6d6c9'];
                      return (
                        <div key={v.vendor} className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: `${colors[idx]}15` }}>
                          <span className="text-2xl">{medals[idx]}</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm truncate">{v.vendor}</p>
                            <p className="text-xs text-muted-foreground">{v.count} factures • {v.pct.toFixed(1)}% • {v.category}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-bold text-lg" style={{ color: colors[idx] }}>{formatEuro(v.totalHT)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Graphique top 15 */}
              <Card className="rounded-2xl shadow-sm border-border">
                <CardHeader>
                  <CardTitle className="font-title text-base flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /> Top 15 fournisseurs</CardTitle>
                  <CardDescription>Coût total HT par fournisseur</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topVendors} layout="vertical" margin={{ top: 5, right: 40, left: 5, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e8d6a4" horizontal={false} />
                        <XAxis type="number" tickFormatter={(v) => formatNumber(Math.round(v / 1000)) + 'k€'} tick={{ fontSize: 10, fill: '#7a654a' }} stroke="#e8d6a4" />
                        <YAxis type="category" dataKey="vendor" width={120} tick={{ fontSize: 9, fill: '#7a654a' }} stroke="#e8d6a4" tickFormatter={(v: string) => v.length > 18 ? v.slice(0, 18) + '…' : v} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#fffaf0', border: '1px solid #e8d6a4', borderRadius: '8px', fontSize: '12px' }}
                          formatter={(value: number, _name: string, props) => {
                            const p = props?.payload;
                            return [`${formatEuro(value)} • ${p?.count ?? 0} factures • ${p?.pct?.toFixed(1) ?? 0}%`, p?.vendor];
                          }}
                        />
                        <Bar dataKey="totalHT" name="Total HT" radius={[0, 4, 4, 0]}>
                          {topVendors.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* === ANALYSE INTELLIGENTE === */}
          {smartAnalysis.length > 0 && (
            <Card className="rounded-2xl shadow-sm border-border">
              <CardHeader>
                <CardTitle className="font-title flex items-center gap-2"><Lightbulb className="h-5 w-5 text-primary" /> Analyse intelligente</CardTitle>
                <CardDescription>Recommandations automatiques basées sur les données de la période</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {smartAnalysis.map((card, idx) => {
                    const Icon = card.icon;
                    return (
                      <div key={idx} className="rounded-xl p-4 border" style={{ backgroundColor: card.bg, borderColor: `${card.color}30` }}>
                        <div className="flex items-start gap-3">
                          <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${card.color}20` }}>
                            <Icon className="h-4 w-4" style={{ color: card.color }} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1">{card.title}</p>
                            <p className="font-bold text-sm truncate" style={{ color: card.color }}>{card.value}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{card.sub}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* === TABLEAU DES CHARGES === */}
          {filtered.length > 0 ? (
            <Card className="rounded-2xl shadow-sm border-border">
              <CardHeader className="pb-3">
                <CardTitle className="font-title text-base flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-primary" /> Détail des charges
                  <span className="text-xs text-muted-foreground font-normal ml-2">({formatNumber(filtered.length)} lignes)</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto max-h-[60vh] overflow-y-auto rounded-b-2xl">
                  <Table>
                    <TableHeader className="sticky top-0 bg-muted z-10">
                      <TableRow>
                        <TableHead className="cursor-pointer select-none hover:bg-muted/80" onClick={() => toggleSort('date')}>
                          <span className="flex items-center gap-1">Date {sortField === 'date' && (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}</span>
                        </TableHead>
                        <TableHead className="cursor-pointer select-none hover:bg-muted/80" onClick={() => toggleSort('vendor')}>
                          <span className="flex items-center gap-1">Fournisseur {sortField === 'vendor' && (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}</span>
                        </TableHead>
                        <TableHead className="cursor-pointer select-none hover:bg-muted/80" onClick={() => toggleSort('category')}>
                          <span className="flex items-center gap-1">Catégorie {sortField === 'category' && (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}</span>
                        </TableHead>
                        <TableHead className="hidden md:table-cell">Client</TableHead>
                        <TableHead className="text-right cursor-pointer select-none hover:bg-muted/80" onClick={() => toggleSort('amountHT')}>
                          <span className="flex items-center gap-1 justify-end">Montant HT {sortField === 'amountHT' && (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}</span>
                        </TableHead>
                        <TableHead className="text-right hidden lg:table-cell">TVA</TableHead>
                        <TableHead className="text-right hidden lg:table-cell cursor-pointer select-none hover:bg-muted/80" onClick={() => toggleSort('amountTTC')}>
                          <span className="flex items-center gap-1 justify-end">TTC {sortField === 'amountTTC' && (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((c) => {
                        const tva = c.amountTTC - c.amountHT;
                        return (
                          <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setSelectedCharge(c)}>
                            <TableCell className="text-sm whitespace-nowrap">{formatDate(c.date)}</TableCell>
                            <TableCell className="text-sm font-medium truncate max-w-[180px]">{c.vendor ?? '—'}</TableCell>
                            <TableCell>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-primary/10 text-primary">
                                {c.category}
                              </span>
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-sm">{c.enseigne ?? '—'}</TableCell>
                            <TableCell className="text-right font-semibold text-destructive text-sm whitespace-nowrap">{formatEuro(c.amountHT)}</TableCell>
                            <TableCell className="text-right hidden lg:table-cell text-sm text-muted-foreground">{formatEuro(tva)}</TableCell>
                            <TableCell className="text-right hidden lg:table-cell text-sm whitespace-nowrap">{formatEuro(c.amountTTC)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="rounded-2xl border-border">
              <CardContent className="p-12 text-center">
                <Receipt className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-40" />
                <p className="text-sm text-muted-foreground mb-2">Aucune charge pour ces filtres.</p>
                <p className="text-xs text-muted-foreground">Importez un fichier Excel ou ajoutez une charge manuellement.</p>
              </CardContent>
            </Card>
          )}
        </main>

        {/* === PANNEAU LATÉRAL DE DÉTAIL (DRAWER) === */}
        <Sheet open={!!selectedCharge} onOpenChange={(open) => !open && setSelectedCharge(null)}>
          <SheetContent className="w-full sm:max-w-md overflow-y-auto">
            {selectedCharge && (
              <>
                <SheetHeader>
                  <SheetTitle className="font-title">Détail de la charge</SheetTitle>
                  <SheetDescription>
                    {formatDate(selectedCharge.date)} • {selectedCharge.source === 'IMPORT' ? 'Import Excel' : 'Saisie manuelle'}
                  </SheetDescription>
                </SheetHeader>
                <div className="space-y-4 mt-6">
                  {/* Montant principal */}
                  <div className="rounded-xl bg-destructive/5 p-4 border border-destructive/20">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1">Montant HT</p>
                    <p className="text-3xl font-title font-bold text-destructive">{formatEuro(selectedCharge.amountHT)}</p>
                    <div className="flex gap-4 mt-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">TVA: </span>
                        <span className="font-medium">{formatEuro(selectedCharge.amountTTC - selectedCharge.amountHT)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">TTC: </span>
                        <span className="font-medium">{formatEuro(selectedCharge.amountTTC)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Détails */}
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Date</Label>
                      <p className="text-sm font-medium">{formatDate(selectedCharge.date)}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Fournisseur</Label>
                      <p className="text-sm font-medium">{selectedCharge.vendor ?? '—'}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Catégorie</Label>
                      <p className="text-sm font-medium">{selectedCharge.category}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Client associé</Label>
                      <p className="text-sm font-medium">{selectedCharge.enseigne ?? '—'}</p>
                    </div>
                    {selectedCharge.subLabel && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Commentaire / Libellé</Label>
                        <p className="text-sm font-medium">{selectedCharge.subLabel}</p>
                      </div>
                    )}
                    {selectedCharge.blNumber && (
                      <div>
                        <Label className="text-xs text-muted-foreground">N° BL</Label>
                        <p className="text-sm font-medium">{selectedCharge.blNumber}</p>
                      </div>
                    )}
                    <div>
                      <Label className="text-xs text-muted-foreground">Méthode d'allocation</Label>
                      <p className="text-sm font-medium">
                        {selectedCharge.allocationMethod === 'DIRECT'
                          ? 'Directe (attribuée à un client)'
                          : 'Globale (ventilée au prorata du CA)'}
                      </p>
                    </div>
                  </div>

                  {/* Pièce justificative (placeholder) */}
                  <div className="rounded-xl border border-dashed border-border p-4 text-center">
                    <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-40" />
                    <p className="text-xs text-muted-foreground">Pièce justificative non attachée</p>
                  </div>

                  {/* Action supprimer */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteCharge(selectedCharge.id)}
                    className="w-full rounded-lg text-destructive hover:bg-destructive/10 border-destructive/30"
                  >
                    <Trash2 className="h-4 w-4 mr-2" /> Supprimer cette charge
                  </Button>
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}

// Combobox avec recherche pour les fournisseurs (363+ items, la liste déroulante simple ne suffit pas)
function VendorCombobox({ vendors, value, onChange }: {
  vendors: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const normalize = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[''`]/g, '').trim();

  const filtered = useMemo(() => {
    const q = normalize(search);
    if (!q) return vendors;
    return vendors.filter(v => normalize(v).includes(q));
  }, [vendors, search]);

  const displayLabel = value === 'all' ? 'Tous fournisseurs' : value;

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => setSearch(''), 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between h-9 px-3 rounded-lg border border-input bg-background text-sm w-[200px] hover:bg-muted/50 transition-colors"
      >
        <span className="truncate">{displayLabel.length > 28 ? displayLabel.slice(0, 28) + '…' : displayLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-2" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-50 w-[400px] bg-card border border-border rounded-lg shadow-xl">
            <div className="flex items-center border-b px-3">
              <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un fournisseur..."
                className="h-9 flex-1 bg-transparent text-sm outline-none"
                autoFocus
              />
              {value !== 'all' && (
                <button
                  type="button"
                  onClick={() => { onChange('all'); setOpen(false); }}
                  className="text-xs text-primary hover:underline shrink-0 ml-2"
                >
                  Réinitialiser
                </button>
              )}
            </div>
            <div className="max-h-[300px] overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Aucun fournisseur trouvé.</p>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => { onChange('all'); setOpen(false); }}
                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors ${value === 'all' ? 'font-medium text-primary' : ''}`}
                  >
                    Tous les fournisseurs
                  </button>
                  {filtered.slice(0, 200).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => { onChange(v); setOpen(false); }}
                      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors truncate ${value === v ? 'font-medium text-primary' : ''}`}
                    >
                      {v}
                    </button>
                  ))}
                  {filtered.length > 200 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      {filtered.length} résultats, affinez avec la recherche…
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
