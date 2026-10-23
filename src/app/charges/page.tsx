'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Receipt, Upload, Loader2, Trash2, Euro, Truck, Search, Plus, Building2 } from 'lucide-react';
import { AppSidebar } from '@/components/app-sidebar';
import { DateRangeFilter } from '@/components/date-range-filter';
import type { DashboardData } from '@/lib/dashboard-types';
import { formatNumber, formatEuro, formatDate } from '@/lib/dashboard-service';
import { toast } from 'sonner';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';

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
}

const COLORS = ['#f7a941', '#3674b5', '#bb7e40', '#a6d6c9', '#e30613', '#ffe111', '#ca8a04', '#db2777'];

export default function ChargesPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [topVendors, setTopVendors] = useState<Array<{ vendor: string; totalHT: number; count: number; category: string; pct: number; }>>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [showAddForm, setShowAddForm] = useState(false);
  // Form nouvelle charge manuelle
  const [newCharge, setNewCharge] = useState({
    date: '', category: 'Transport', subLabel: '', vendor: '', amountHT: '', enseigne: '',
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
        setCategories(json.categories || []);
      }
    } catch {}
    setLoading(false);
  }, [filterCategory, dateRange]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  useEffect(() => { loadCharges(); }, [loadCharges]);

  const handleHome = () => { window.location.href = '/'; };

  // KPIs calculés à partir des charges affichées (filtrées)
  const filtered = charges.filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.category.toLowerCase().includes(q) ||
      (c.subLabel ?? '').toLowerCase().includes(q) ||
      (c.vendor ?? '').toLowerCase().includes(q) ||
      (c.enseigne ?? '').toLowerCase().includes(q)
    );
  });

  const kpis = {
    totalHT: filtered.reduce((s, c) => s + c.amountHT, 0),
    totalTTC: filtered.reduce((s, c) => s + c.amountTTC, 0),
    nbCharges: filtered.length,
    transport: filtered.filter(c => c.category.toLowerCase().includes('transport') || c.category.toLowerCase().includes('carburant')).reduce((s, c) => s + c.amountHT, 0),
    direct: filtered.filter(c => c.allocationMethod === 'DIRECT').reduce((s, c) => s + c.amountHT, 0),
  };

  // Groupement par catégorie pour le tableau récap
  const byCategory = filtered.reduce((acc, c) => {
    if (!acc[c.category]) acc[c.category] = { total: 0, count: 0 };
    acc[c.category].total += c.amountHT;
    acc[c.category].count += 1;
    return acc;
  }, {} as Record<string, { total: number; count: number }>);
  const categoryList = Object.entries(byCategory)
    .map(([cat, d]) => ({ category: cat, total: d.total, count: d.count, pct: kpis.totalHT > 0 ? (d.total / kpis.totalHT) * 100 : 0 }))
    .sort((a, b) => b.total - a.total);

  const deleteCharge = async (id: string) => {
    if (!confirm('Supprimer cette charge ?')) return;
    try {
      const res = await fetch(`/api/charges?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      toast.success('Charge supprimée');
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
      setNewCharge({ date: '', category: 'Transport', subLabel: '', vendor: '', amountHT: '', enseigne: '' });
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
        <header className="border-b border-border bg-card sticky top-0 z-30">
          <div className="px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <Link href="/"><Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Retour</Button></Link>
              <div className="hidden sm:flex items-center gap-2">
                <Receipt className="h-5 w-5 text-primary" />
                <h1 className="font-title text-lg font-bold">Charges</h1>
              </div>
            </div>
            <Link href="/analytique">
              <Button size="sm" variant="outline" className="border-primary/30 text-primary hover:bg-primary/10">
                <Euro className="h-4 w-4 mr-2" /> Feuille analytique
              </Button>
            </Link>
          </div>
        </header>

        <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-6 space-y-4">
          {/* Barre de filtres + import */}
          <Card className="border-border">
            <CardContent className="p-3 flex items-center gap-2 flex-wrap">
              <Button size="sm" onClick={() => document.getElementById('charges-import-input')?.click()} className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Upload className="h-4 w-4 mr-2" /> Importer Excel
              </Button>
              <input id="charges-import-input" type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); }} />
              <Button size="sm" variant="outline" onClick={() => setShowAddForm(!showAddForm)}>
                <Plus className="h-4 w-4 mr-2" /> Ajouter manuellement
              </Button>
              <DateRangeFilter
                startDate={dateRange.start}
                endDate={dateRange.end}
                onChange={(s, e) => setDateRange({ start: s, end: e })}
                onReset={() => setDateRange({ start: '', end: '' })}
              />
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="h-8 text-sm w-[180px]"><SelectValue placeholder="Toutes catégories" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes catégories</SelectItem>
                  {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher (catégorie, libellé, fournisseur, client)..." className="pl-8 h-8 text-sm" />
              </div>
            </CardContent>
          </Card>

          {/* Form ajout manuel */}
          {showAddForm && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-3 grid gap-2 sm:grid-cols-6 items-end">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Date *</label>
                  <Input type="date" value={newCharge.date} onChange={(e) => setNewCharge({ ...newCharge, date: e.target.value })} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Catégorie</label>
                  <Select value={newCharge.category} onValueChange={(v) => setNewCharge({ ...newCharge, category: v })}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Transport">Transport</SelectItem>
                      <SelectItem value="Salaires & charges sociales">Salaires & charges sociales</SelectItem>
                      <SelectItem value="Loyer">Loyer</SelectItem>
                      <SelectItem value="Énergie">Énergie</SelectItem>
                      <SelectItem value="Marketing">Marketing</SelectItem>
                      <SelectItem value="Assurances">Assurances</SelectItem>
                      <SelectItem value="Achats matières">Achats matières</SelectItem>
                      <SelectItem value="Honoraires">Honoraires</SelectItem>
                      <SelectItem value="Taxes & impôts">Taxes & impôts</SelectItem>
                      <SelectItem value="Autres">Autres</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Libellé</label>
                  <Input value={newCharge.subLabel} onChange={(e) => setNewCharge({ ...newCharge, subLabel: e.target.value })} placeholder="Ex: Livraison Auchan" className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Fournisseur</label>
                  <Input value={newCharge.vendor} onChange={(e) => setNewCharge({ ...newCharge, vendor: e.target.value })} placeholder="Optionnel" className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Montant HT € *</label>
                  <Input type="number" step="0.01" value={newCharge.amountHT} onChange={(e) => setNewCharge({ ...newCharge, amountHT: e.target.value })} placeholder="0.00" className="h-8 text-sm" />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setShowAddForm(false)} className="h-8">Annuler</Button>
                  <Button size="sm" onClick={addChargeManual} className="bg-primary text-primary-foreground hover:bg-primary/90 h-8"><Plus className="h-3.5 w-3.5" /></Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* KPIs */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total charges HT</p>
                <p className="text-lg font-title font-bold text-primary">{formatEuro(kpis.totalHT)}</p>
                <p className="text-[10px] text-muted-foreground">{formatNumber(kpis.nbCharges)} lignes</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total charges TTC</p>
                <p className="text-lg font-title font-bold">{formatEuro(kpis.totalTTC)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide"><Truck className="inline h-3 w-3 mr-1" />Transport + carburant</p>
                <p className="text-lg font-title font-bold" style={{ color: '#bb7e40' }}>{formatEuro(kpis.transport)}</p>
                <p className="text-[10px] text-muted-foreground">{kpis.totalHT > 0 ? `${(kpis.transport / kpis.totalHT * 100).toFixed(1)}% du total` : '—'}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Charges directes (par client)</p>
                <p className="text-lg font-title font-bold" style={{ color: '#3674b5' }}>{formatEuro(kpis.direct)}</p>
                <p className="text-[10px] text-muted-foreground">vs global: {formatEuro(kpis.totalHT - kpis.direct)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Répartition par catégorie */}
          {categoryList.length > 0 && (
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="font-title text-base flex items-center gap-2"><Euro className="h-4 w-4 text-primary" /> Répartition par catégorie</CardTitle>
                <CardDescription>Charges HT ventilées par type — {categoryList.length} catégories distinctes</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {categoryList.map((c) => {
                    const max = categoryList[0]?.total || 1;
                    return (
                      <div key={c.category} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium truncate flex-1">{c.category}</span>
                          <div className="flex gap-3 text-right shrink-0">
                            <span className="text-muted-foreground">{c.count} ligne(s)</span>
                            <span className="font-semibold text-primary">{formatEuro(c.total)}</span>
                            <span className="text-muted-foreground w-12 text-right">{c.pct.toFixed(1)}%</span>
                          </div>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${(c.total / max) * 100}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Top 15 fournisseurs les plus coûteux */}
          {topVendors.length > 0 && (
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="font-title text-base flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /> Top 15 fournisseurs</CardTitle>
                <CardDescription>Coût total HT par fournisseur — sur la période filtrée ({topVendors.length} plus gros)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[420px] w-full">
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
                        width={140}
                        tick={{ fontSize: 10, fill: '#7a654a' }}
                        stroke="#e8d6a4"
                        tickFormatter={(v: string) => v.length > 22 ? v.slice(0, 22) + '…' : v}
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
                {/* Légende combinée + tableau récap rapide */}
                <div className="mt-3 grid gap-1 sm:grid-cols-2 lg:grid-cols-3 text-xs">
                  {topVendors.slice(0, 6).map((v, idx) => (
                    <div key={v.vendor} className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                      <span className="font-medium truncate flex-1">{v.vendor}</span>
                      <span className="text-muted-foreground shrink-0">{formatEuro(v.totalHT)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Table des charges */}
          {filtered.length > 0 ? (
            <Card className="border-border">
              <CardContent className="p-0">
                <div className="overflow-x-auto max-h-[55vh] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-muted z-10">
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Catégorie</TableHead>
                        <TableHead>Libellé</TableHead>
                        <TableHead className="hidden md:table-cell">Fournisseur</TableHead>
                        <TableHead className="hidden md:table-cell">Client</TableHead>
                        <TableHead className="text-right">HT</TableHead>
                        <TableHead className="text-right hidden lg:table-cell">TTC</TableHead>
                        <TableHead className="hidden sm:table-cell">Allocation</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="text-sm">{formatDate(c.date)}</TableCell>
                          <TableCell>
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                              {c.category}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm truncate max-w-[260px]" title={c.subLabel ?? ''}>{c.subLabel ?? '—'}</TableCell>
                          <TableCell className="hidden md:table-cell text-sm">{c.vendor ?? '—'}</TableCell>
                          <TableCell className="hidden md:table-cell text-sm">{c.enseigne ?? '—'}</TableCell>
                          <TableCell className="text-right font-semibold text-destructive text-sm">{formatEuro(c.amountHT)}</TableCell>
                          <TableCell className="text-right hidden lg:table-cell text-sm">{formatEuro(c.amountTTC)}</TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${c.allocationMethod === 'DIRECT' ? 'bg-cobalt/10 text-cobalt' : 'bg-muted text-muted-foreground'}`} style={c.allocationMethod === 'DIRECT' ? { color: '#3674b5' } : {}}>
                              {c.allocationMethod === 'DIRECT' ? 'Direct' : 'Global'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" onClick={() => deleteCharge(c.id)} className="h-7 w-7 text-destructive hover:bg-destructive/10">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border">
              <CardContent className="p-12 text-center">
                <Receipt className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-40" />
                <p className="text-sm text-muted-foreground mb-2">Aucune charge pour ces filtres.</p>
                <p className="text-xs text-muted-foreground">Importez un fichier Excel ou ajoutez une charge manuellement.</p>
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}
