'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, ChevronDown, ChevronRight, Store, Search, Calculator, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { formatEuro } from '@/lib/dashboard-service';

interface Product {
  id: string; name: string;
  parfum?: { name: string }; format?: { name: string; potsPerColis: number; potsPerFormat: number | null; unitesFormatPerColis: number | null; colisPerPalette: number | null; };
  purchasePrices?: Array<{ pricePerPot: number; pricePerFormat: number | null; pricePerColis: number; endDate: string | null; }>;
}
interface SalesPrice {
  id: string; productId: string; enseigne: string;
  tarifDepart: number; remisePercent: number; finalPrice: number; notes: string | null;
}
interface Enseigne { id: string; name: string; type: string; agent: string; isActive: boolean; }

interface ClientWithTariffs {
  enseigne: Enseigne;
  tariffs: Array<SalesPrice & { product?: Product }>;
  totalColis: number;
}

// === Marge estimée par pot (avec charges directes) ===
interface MargeProduct {
  productId: string; name: string; parfum: string; format: string;
  potsPerColis: number; nbColis: number; nbPots: number; caProduct: number;
  prixVenteMoyenParPot: number; achatParPot: number | null; achatParColis: number | null;
  margeBruteParPot: number | null; chargesParPot: number;
  margeNetteParPot: number | null; margePct: number | null;
}
interface MargeTotals {
  chargesDirectesTTC: number; chargesTransport: number; chargesMarketing: number;
  chargesCatalogues: number; chargesImprimes: number;
  totalCAProduits: number; totalPots: number;
  periode: { start: string; end: string };
  options: { includeMarketing: boolean; includeCatalogues: boolean; includeImprimes: boolean; includeTransport: boolean; };
}

export function ClientTariffPanel() {
  const [clients, setClients] = useState<ClientWithTariffs[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddClient, setShowAddClient] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientType, setNewClientType] = useState('Direct');
  const [newClientAgent, setNewClientAgent] = useState('CAP FRAIS');
  // Per-client add-product form state
  const [addForms, setAddForms] = useState<Record<string, { productId: string; tarif: string; remise: string; show: boolean }>>({});
  // Marge estimée par pot (charges directes) — partagée entre la carte dédiée
  // et la colonne "Marge nette" de la grille tarifaire.
  const [margeProducts, setMargeProducts] = useState<MargeProduct[]>([]);
  const [margeTotals, setMargeTotals] = useState<MargeTotals | null>(null);
  const [margeOptions, setMargeOptions] = useState({ includeMarketing: true, includeCatalogues: false, includeImprimes: false });

  // Map productId → chargesParPot pour lookup rapide dans la grille tarifaire
  const chargesParPotByProduct = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of margeProducts) m.set(p.productId, p.chargesParPot);
    return m;
  }, [margeProducts]);

  const loadAll = useCallback(async () => {
    try {
      const [ensRes, prodRes, spRes] = await Promise.all([
        fetch('/api/enseignes'),
        fetch('/api/products?withPrices=true&active=true'),
        fetch('/api/products/sales-prices'),
      ]);
      const ensJson = await ensRes.json();
      const prodJson = await prodRes.json();
      const spJson = await spRes.json();

      const enseignes: Enseigne[] = ensJson.ok ? ensJson.data.filter((e: Enseigne) => e.isActive) : [];
      const prods: Product[] = prodJson.ok ? prodJson.data.filter((p: Product) => p.parfum && p.format) : [];
      const allSP: SalesPrice[] = spJson.ok ? spJson.data : [];
      setProducts(prods);

      // Group sales prices by enseigne
      const spByEnseigne = new Map<string, SalesPrice[]>();
      for (const sp of allSP) {
        if (!spByEnseigne.has(sp.enseigne)) spByEnseigne.set(sp.enseigne, []);
        spByEnseigne.get(sp.enseigne)!.push(sp);
      }

      // Build client list with tariffs
      const result: ClientWithTariffs[] = enseignes.map(e => {
        const tariffs = (spByEnseigne.get(e.name) || []).map(sp => {
          const product = prods.find(p => p.id === sp.productId);
          return { ...sp, product };
        });
        return { enseigne: e, tariffs, totalColis: tariffs.length };
      }).filter(c => c.totalColis > 0 || enseignes.find(e => e.name === c.enseigne.name));

      setClients(result);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Chargement de la marge estimée par pot (avec charges directes)
  const [margeExpanded, setMargeExpanded] = useState(false);
  const [margeLoading, setMargeLoading] = useState(false);
  const [margeExpandedProduct, setMargeExpandedProduct] = useState<string | null>(null);
  // Sélecteur de période pour le calcul de marge
  // filterMode: 'all' | 'month' | 'range'
  const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const [margeFilterMode, setMargeFilterMode] = useState<'all' | 'month' | 'range'>('all');
  const [margeMonth, setMargeMonth] = useState<number>(new Date().getMonth() + 1);
  const [margeYear, setMargeYear] = useState<number>(new Date().getFullYear());
  const [margeRangeStart, setMargeRangeStart] = useState<string>('');
  const [margeRangeEnd, setMargeRangeEnd] = useState<string>('');

  // Calcule les dates startDate/endDate (JJ/MM/AAAA) selon le mode sélectionné
  const margePeriodParams = useMemo(() => {
    if (margeFilterMode === 'month') {
      const lastDay = new Date(margeYear, margeMonth, 0).getDate();
      return {
        startDate: `${String(margeMonth).padStart(2, '0')}/01/${margeYear}`,
        endDate: `${String(margeMonth).padStart(2, '0')}/${String(lastDay).padStart(2, '0')}/${margeYear}`,
      };
    }
    if (margeFilterMode === 'range' && margeRangeStart && margeRangeEnd) {
      return { startDate: margeRangeStart, endDate: margeRangeEnd };
    }
    return { startDate: '', endDate: '' }; // 'all' = année civile en cours (default API)
  }, [margeFilterMode, margeMonth, margeYear, margeRangeStart, margeRangeEnd]);

  const margePeriodLabel = useMemo(() => {
    if (margeFilterMode === 'month') return `${MONTHS[margeMonth - 1]} ${margeYear}`;
    if (margeFilterMode === 'range' && margeRangeStart && margeRangeEnd) return `${margeRangeStart} → ${margeRangeEnd}`;
    return 'Toute la période (année civile en cours)';
  }, [margeFilterMode, margeMonth, margeYear, margeRangeStart, margeRangeEnd]);

  const loadMarge = useCallback(async () => {
    setMargeLoading(true);
    try {
      const params = new URLSearchParams({
        includeMarketing: String(margeOptions.includeMarketing),
        includeCatalogues: String(margeOptions.includeCatalogues),
        includeImprimes: String(margeOptions.includeImprimes),
      });
      if (margePeriodParams.startDate) params.set('startDate', margePeriodParams.startDate);
      if (margePeriodParams.endDate) params.set('endDate', margePeriodParams.endDate);
      const res = await fetch(`/api/products/marge-estimee?${params}`, { cache: 'no-store' });
      const json = await res.json();
      if (json.ok) {
        setMargeProducts(json.products);
        setMargeTotals(json.totals);
      } else {
        toast.error(json.error || 'Erreur marge');
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setMargeLoading(false);
    }
  }, [margeOptions, margePeriodParams]);

  useEffect(() => {
    if (margeExpanded && margeProducts.length === 0) loadMarge();
  }, [margeExpanded, loadMarge, margeProducts.length]);

  useEffect(() => {
    if (margeExpanded) loadMarge();
  }, [margeOptions, margeExpanded, margePeriodParams, loadMarge]);

  const filtered = clients.filter(c =>
    !search.trim() ||
    c.enseigne.name.toLowerCase().includes(search.toLowerCase()) ||
    c.enseigne.type.toLowerCase().includes(search.toLowerCase())
  );

  const addClient = async () => {
    if (!newClientName.trim()) { toast.error('Nom requis'); return; }
    try {
      const res = await fetch('/api/enseignes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newClientName.trim(), type: newClientType, agent: newClientAgent || 'KOOK\'S', isActive: true }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      toast.success(`Client "${newClientName}" créé`);
      setNewClientName(''); setShowAddClient(false);
      loadAll();
    } catch (e: any) { toast.error(e.message); }
  };

  const addProductToClient = async (enseigne: string, productId: string, tarif: string, remise: string) => {
    const t = parseFloat(tarif);
    const r = parseFloat(remise) || 0;
    if (isNaN(t) || t <= 0) { toast.error('Tarif invalide'); return; }
    try {
      const res = await fetch('/api/products/sales-prices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, enseigne, tarifDepart: t, remisePercent: r }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      toast.success('Produit affecté');
      // Reset form
      setAddForms(prev => ({ ...prev, [enseigne]: { productId: '', tarif: '', remise: '0', show: false } }));
      loadAll();
    } catch (e: any) { toast.error(e.message); }
  };

  const deleteTariff = async (id: string, enseigne: string) => {
    if (!confirm('Supprimer ce tarif ?')) return;
    try {
      const res = await fetch(`/api/products/sales-prices/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      toast.success('Tarif supprimé');
      loadAll();
    } catch (e: any) { toast.error(e.message); }
  };

  const updateTariff = async (sp: SalesPrice, tarif: number, remise: number) => {
    try {
      const res = await fetch('/api/products/sales-prices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: sp.productId, enseigne: sp.enseigne, tarifDepart: tarif, remisePercent: remise }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      loadAll();
    } catch (e: any) { toast.error(e.message); }
  };

  const getAddForm = (enseigne: string) => {
    return addForms[enseigne] || { productId: '', tarif: '', remise: '0', show: false };
  };

  const setAddForm = (enseigne: string, updates: Partial<{ productId: string; tarif: string; remise: string; show: boolean }>) => {
    setAddForms(prev => ({ ...prev, [enseigne]: { ...getAddForm(enseigne), ...updates } }));
  };

  if (loading) return <Card><CardContent className="p-8 text-center text-muted-foreground">Chargement...</CardContent></Card>;

  return (
    <div className="space-y-3">
      {/* Recherche + ajout client */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un client..." className="pl-8 h-9" />
        </div>
        <Button size="sm" onClick={() => setShowAddClient(!showAddClient)} className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4 mr-2" /> Nouveau client
        </Button>
      </div>

      {/* Formulaire nouveau client */}
      {showAddClient && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-3 grid gap-2 sm:grid-cols-4 items-end">
            <div className="space-y-1">
              <Label className="text-xs font-medium">Nom du client *</Label>
              <Input value={newClientName} onChange={(e) => setNewClientName(e.target.value)} placeholder="Ex: NOUVEAU MAGASIN" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Type</Label>
              <Select value={newClientType} onValueChange={setNewClientType}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Direct">Direct</SelectItem>
                  <SelectItem value="Centrale">Centrale</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Agent</Label>
              <Select value={newClientAgent} onValueChange={setNewClientAgent}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CAP FRAIS">CAP FRAIS</SelectItem>
                  <SelectItem value="BROCARD">BROCARD</SelectItem>
                  <SelectItem value="KOOK'S">KOOK'S</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowAddClient(false)}>Annuler</Button>
              <Button size="sm" onClick={addClient} className="bg-primary text-primary-foreground hover:bg-primary/90"><Plus className="h-3.5 w-3.5" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* === Marge estimée par pot (avec charges directes) === */}
      <EstimatedMarginCard
        products={margeProducts}
        totals={margeTotals}
        options={margeOptions}
        expanded={margeExpanded}
        expandedProduct={margeExpandedProduct}
        loading={margeLoading}
        setExpanded={setMargeExpanded}
        setExpandedProduct={setMargeExpandedProduct}
        setOptions={setMargeOptions}
        load={loadMarge}
        filterMode={margeFilterMode}
        setFilterMode={setMargeFilterMode}
        month={margeMonth}
        setMonth={setMargeMonth}
        year={margeYear}
        setYear={setMargeYear}
        rangeStart={margeRangeStart}
        setRangeStart={setMargeRangeStart}
        rangeEnd={margeRangeEnd}
        setRangeEnd={setMargeRangeEnd}
        periodLabel={margePeriodLabel}
      />

      {/* Liste des clients avec tarifs */}
      <div className="space-y-2">
        {filtered.map((client) => {
          const isExpanded = expandedClient === client.enseigne.name;
          const addForm = getAddForm(client.enseigne.name);
          const assignedProductIds = new Set(client.tariffs.map(t => t.productId));
          const availableProducts = products.filter(p => !assignedProductIds.has(p.id));

          return (
            <Card key={client.enseigne.id} className="border-border overflow-hidden">
              {/* En-tête client (cliquable pour déplier) */}
              <div
                className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => setExpandedClient(isExpanded ? null : client.enseigne.name)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <Store className="h-4 w-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{client.enseigne.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {client.enseigne.type} • {client.enseigne.agent} • {client.tariffs.length} produit(s)
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  {client.tariffs.length > 0 && (
                    <span className="text-muted-foreground">
                      CA moy: {formatEuro(client.tariffs.reduce((s, t) => s + t.finalPrice, 0) / Math.max(client.tariffs.length, 1))}
                    </span>
                  )}
                </div>
              </div>

              {/* Détail des tarifs (dépliable) */}
              {isExpanded && (
                <CardContent className="p-0 border-t border-border">
                  {client.tariffs.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      Aucun produit affecté. Cliquez sur « Affecter un produit » ci-dessous.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader className="bg-muted">
                          <TableRow>
                            <TableHead>Produit</TableHead>
                            <TableHead className="text-right">Tarif départ</TableHead>
                            <TableHead className="text-right">Remise %</TableHead>
                            <TableHead className="text-right">Prix final</TableHead>
                            <TableHead className="text-right hidden md:table-cell">Marge brute/pot</TableHead>
                            <TableHead className="text-right hidden lg:table-cell">Marge nette/pot <span className="text-[10px] font-normal text-muted-foreground">(charges directes)</span></TableHead>
                            <TableHead className="text-right hidden md:table-cell">Marge/colis</TableHead>
                            <TableHead className="w-10"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {client.tariffs.map((sp) => {
                            const product = products.find(p => p.id === sp.productId) || sp.product;
                            const currentPrice = product?.purchasePrices?.find(pp => pp.endDate === null);
                            const fmt = product?.format;
                            const finalColis = sp.finalPrice;
                            const potsPerColis = fmt?.potsPerColis ?? 1;
                            const potsPerFormat = fmt?.potsPerFormat ?? 1;
                            const finalPot = finalColis / potsPerColis;
                            const finalFormat = finalColis / (potsPerColis / potsPerFormat);
                            const achatPot = currentPrice?.pricePerPot ?? null;
                            const achatColis = currentPrice?.pricePerColis ?? null;
                            const margePot = achatPot !== null ? finalPot - achatPot : null;
                            const margeColis = achatColis !== null ? finalColis - achatColis : null;
                            // Marge nette = marge brute - charges directes allouées au pot
                            const chargesParPot = chargesParPotByProduct.get(sp.productId) ?? 0;
                            const margeNettePot = margePot !== null ? margePot - chargesParPot : null;

                            return (
                              <TariffRow
                                key={sp.id}
                                sp={sp}
                                productName={product?.name ?? sp.productId}
                                margePot={margePot}
                                margeColis={margeColis}
                                margeNettePot={margeNettePot}
                                chargesParPot={chargesParPot}
                                finalPot={finalPot}
                                finalFormat={finalFormat}
                                achatPot={achatPot}
                                achatColis={achatColis}
                                onUpdate={updateTariff}
                                onDelete={deleteTariff}
                              />
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  {/* Affecter un produit */}
                  <div className="p-3 border-t border-border bg-muted/30">
                    {addForm.show ? (
                      <div className="grid gap-2 sm:grid-cols-4 items-end">
                        <div className="space-y-1 sm:col-span-2">
                          <Label className="text-xs font-medium">Produit à affecter</Label>
                          <Select value={addForm.productId || '__none__'} onValueChange={(v) => setAddForm(client.enseigne.name, { productId: v === '__none__' ? '' : v })}>
                            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Choisir un produit" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">— Choisir —</SelectItem>
                              {availableProducts.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-medium">Tarif €</Label>
                          <Input type="number" step="0.01" value={addForm.tarif} onChange={(e) => setAddForm(client.enseigne.name, { tarif: e.target.value })} placeholder="Ex: 14.784" className="h-8 text-sm" />
                        </div>
                        <div className="flex gap-2">
                          <div className="space-y-1 flex-1">
                            <Label className="text-xs font-medium">Remise %</Label>
                            <Input type="number" step="0.1" value={addForm.remise} onChange={(e) => setAddForm(client.enseigne.name, { remise: e.target.value })} placeholder="0" className="h-8 text-sm" />
                          </div>
                          <Button size="sm" variant="outline" onClick={() => setAddForm(client.enseigne.name, { show: false })} className="h-8">✕</Button>
                          <Button size="sm" onClick={() => addProductToClient(client.enseigne.name, addForm.productId, addForm.tarif, addForm.remise)} className="bg-primary text-primary-foreground hover:bg-primary/90 h-8">
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setAddForm(client.enseigne.name, { show: true })} disabled={availableProducts.length === 0} className="w-full border-dashed">
                        <Plus className="h-4 w-4 mr-2" />
                        {availableProducts.length === 0 ? 'Tous les produits sont affectés' : 'Affecter un produit'}
                      </Button>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {filtered.length === 0 && !loading && (
        <Card className="border-border">
          <CardContent className="p-12 text-center">
            <Store className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-40" />
            <p className="text-sm text-muted-foreground">Aucun client trouvé. Créez-en un avec le bouton « Nouveau client ».</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// === Ligne tarif éditable ===
function TariffRow({
  sp, productName, margePot, margeColis, margeNettePot, chargesParPot,
  finalPot, finalFormat, achatPot, achatColis,
  onUpdate, onDelete,
}: {
  sp: SalesPrice; productName: string;
  margePot: number | null; margeColis: number | null;
  margeNettePot: number | null; chargesParPot: number;
  finalPot: number; finalFormat: number;
  achatPot: number | null; achatColis: number | null;
  onUpdate: (sp: SalesPrice, tarif: number, remise: number) => void;
  onDelete: (id: string, enseigne: string) => void;
}) {
  const [tarif, setTarif] = useState(sp.tarifDepart.toFixed(2));
  const [remise, setRemise] = useState(sp.remisePercent.toFixed(1));

  useEffect(() => {
    setTarif(sp.tarifDepart.toFixed(2));
    setRemise(sp.remisePercent.toFixed(1));
  }, [sp.tarifDepart, sp.remisePercent]);

  const finalPrice = parseFloat(tarif) * (1 - (parseFloat(remise) || 0) / 100);
  const currentFinalPot = finalPrice / (finalPot > 0 ? (finalPot > 0 ? sp.finalPrice / finalPot : 1) : 1);

  const save = () => {
    const t = parseFloat(tarif);
    const r = parseFloat(remise) || 0;
    if (isNaN(t) || t < 0) { toast.error('Tarif invalide'); return; }
    if (t !== sp.tarifDepart || r !== sp.remisePercent) onUpdate(sp, t, r);
  };

  return (
    <TableRow>
      <TableCell className="font-medium text-sm">{productName}</TableCell>
      <TableCell className="text-right">
        <Input type="number" step="0.01" value={tarif} onChange={(e) => setTarif(e.target.value)} onBlur={save} className="h-7 w-20 text-xs text-right inline-block" />
      </TableCell>
      <TableCell className="text-right">
        <Input type="number" step="0.1" value={remise} onChange={(e) => setRemise(e.target.value)} onBlur={save} className="h-7 w-16 text-xs text-right inline-block" />
      </TableCell>
      <TableCell className="text-right font-semibold text-primary text-sm">{formatEuro(finalPrice)}</TableCell>
      <TableCell className="text-right hidden md:table-cell text-xs">
        {margePot !== null ? (
          <div>
            <div className={margePot >= 0 ? 'text-emerald-600 font-medium' : 'text-destructive font-medium'}>{formatEuro(margePot)}</div>
            <div className="text-[10px] text-muted-foreground">achat: {formatEuro(achatPot!)}</div>
          </div>
        ) : <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="text-right hidden lg:table-cell text-xs">
        {margeNettePot !== null ? (
          <div>
            <div className={margeNettePot >= 0 ? 'text-primary font-semibold' : 'text-destructive font-semibold'}>{formatEuro(margeNettePot)}</div>
            <div className="text-[10px] text-muted-foreground">charges: {formatEuro(chargesParPot)}</div>
          </div>
        ) : <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="text-right hidden md:table-cell text-xs">
        {margeColis !== null ? (
          <div>
            <div className={margeColis >= 0 ? 'text-emerald-600 font-medium' : 'text-destructive font-medium'}>{formatEuro(margeColis)}</div>
            <div className="text-[10px] text-muted-foreground">achat: {formatEuro(achatColis!)}</div>
          </div>
        ) : <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell>
        <Button variant="ghost" size="icon" onClick={() => onDelete(sp.id, sp.enseigne)} className="h-7 w-7 text-destructive hover:bg-destructive/10" title="Supprimer">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function EstimatedMarginCard({
  products, totals, options, expanded, expandedProduct,
  loading, setExpanded, setExpandedProduct, setOptions, load,
  filterMode, setFilterMode, month, setMonth, year, setYear,
  rangeStart, setRangeStart, rangeEnd, setRangeEnd, periodLabel,
}: {
  products: MargeProduct[];
  totals: MargeTotals | null;
  options: { includeMarketing: boolean; includeCatalogues: boolean; includeImprimes: boolean };
  expanded: boolean;
  expandedProduct: string | null;
  loading: boolean;
  setExpanded: (v: boolean) => void;
  setExpandedProduct: (v: string | null) => void;
  setOptions: (v: { includeMarketing: boolean; includeCatalogues: boolean; includeImprimes: boolean }) => void;
  load: () => void;
  filterMode: 'all' | 'month' | 'range';
  setFilterMode: (v: 'all' | 'month' | 'range') => void;
  month: number;
  setMonth: (v: number) => void;
  year: number;
  setYear: (v: number) => void;
  rangeStart: string;
  setRangeStart: (v: string) => void;
  rangeEnd: string;
  setRangeEnd: (v: string) => void;
  periodLabel: string;
}) {
  const { includeMarketing, includeCatalogues, includeImprimes } = options;
  const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

  return (
    <Card className="border-primary/30 bg-primary/5 overflow-hidden">
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-primary/10 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 min-w-0">
          {expanded ? <ChevronDown className="h-4 w-4 text-primary shrink-0" /> : <ChevronRight className="h-4 w-4 text-primary shrink-0" />}
          <Calculator className="h-4 w-4 text-primary shrink-0" />
          <div className="min-w-0">
            <p className="font-medium text-sm text-primary">Marge estimée par pot (avec charges directes)</p>
            <p className="text-xs text-muted-foreground">
              Calcule la marge nette par pot en allouant les charges directes (Transport + options) au prorata du CA.
            </p>
          </div>
        </div>
        {totals && (
          <span className="text-xs text-muted-foreground shrink-0 text-right">
            <span className="block">{products.length} réf. • {formatEuro(totals.chargesDirectesTTC)} charges directes</span>
            <span className="block text-[10px]">Période : {periodLabel}</span>
          </span>
        )}
      </div>

      {expanded && (
        <CardContent className="p-3 border-t border-primary/20 space-y-3">
          {/* Sélecteur de période */}
          <div className="rounded-md border border-border bg-card p-2.5 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Période du calcul :</span>
              <div className="flex gap-1">
                <Button size="sm" variant={filterMode === 'all' ? 'default' : 'outline'} onClick={() => setFilterMode('all')} className="h-7 text-xs">Tout</Button>
                <Button size="sm" variant={filterMode === 'month' ? 'default' : 'outline'} onClick={() => setFilterMode('month')} className="h-7 text-xs">Mois</Button>
                <Button size="sm" variant={filterMode === 'range' ? 'default' : 'outline'} onClick={() => setFilterMode('range')} className="h-7 text-xs">Plage</Button>
              </div>
              {filterMode === 'month' && (
                <div className="flex items-center gap-1.5">
                  <select
                    className="border rounded px-2 py-1 text-xs h-7 bg-card"
                    value={month}
                    onChange={(e) => setMonth(parseInt(e.target.value))}
                  >
                    {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                  <Input
                    type="number"
                    className="w-20 h-7 text-xs"
                    value={year}
                    onChange={(e) => setYear(parseInt(e.target.value) || new Date().getFullYear())}
                  />
                </div>
              )}
              {filterMode === 'range' && (
                <div className="flex items-center gap-1.5">
                  <Input className="w-32 h-7 text-xs" placeholder="01/11/2026" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
                  <span className="text-xs text-muted-foreground">→</span>
                  <Input className="w-32 h-7 text-xs" placeholder="15/11/2026" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
                </div>
              )}
              {filterMode === 'range' && (!rangeStart || !rangeEnd) && (
                <span className="text-[11px] text-amber-600">Renseigne début et fin (JJ/MM/AAAA)</span>
              )}
              <span className="text-xs text-muted-foreground ml-auto">
                Sélection : <span className="font-medium text-foreground">{periodLabel}</span>
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Les volumes (CA, pots) et les charges directes TTC sont calculés sur cette période.
              Les marges nettes par pot s'adaptent automatiquement.
            </p>
          </div>

          {/* Toggles charges directes à inclure */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Charges directes incluses :</span>
            <Toggle on={true} disabled label="Transport (toujours)" />
            <Toggle on={includeMarketing} onChange={(v) => setOptions({ ...options, includeMarketing: v })} label="Marketing & publicité" />
            <Toggle on={includeCatalogues} onChange={(v) => setOptions({ ...options, includeCatalogues: v })} label="Catalogues & imprimés" />
            <Toggle on={includeImprimes} onChange={(v) => setOptions({ ...options, includeImprimes: v })} label="Fournitures / papeterie" />
            <Button size="sm" variant="outline" onClick={load} disabled={loading} className="h-7 text-xs">
              {loading ? 'Calcul…' : 'Recalculer'}
            </Button>
          </div>

          {/* Synthèse */}
          {totals && (
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 text-xs">
              <MiniStat label="Charges directes TTC" value={formatEuro(totals.chargesDirectesTTC)} accent="primary" />
              <MiniStat label="Dont Transport" value={formatEuro(totals.chargesTransport)} />
              {includeMarketing && <MiniStat label="Dont Marketing" value={formatEuro(totals.chargesMarketing)} />}
              {includeCatalogues && <MiniStat label="Dont Catalogues" value={formatEuro(totals.chargesCatalogues)} />}
              {includeImprimes && <MiniStat label="Dont Imprimés" value={formatEuro(totals.chargesImprimes)} />}
              <MiniStat label="CA produits (période)" value={formatEuro(totals.totalCAProduits)} />
              <MiniStat label="Pots vendus" value={totals.totalPots.toLocaleString('fr-FR')} />
              <MiniStat label="Période" value={`${totals.periode.start} → ${totals.periode.end}`} small />
            </div>
          )}

          {/* Tableau marge par produit */}
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-4">Calcul en cours…</p>
          ) : products.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Aucune donnée de volume pour la période.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <Table>
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead className="cursor-pointer">Référence (parfum × format)</TableHead>
                    <TableHead className="text-right">CA période</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">Pots</TableHead>
                    <TableHead className="text-right">Prix vente moy./pot</TableHead>
                    <TableHead className="text-right hidden md:table-cell">Achat/pot</TableHead>
                    <TableHead className="text-right hidden md:table-cell">Charges/pot</TableHead>
                    <TableHead className="text-right">Marge nette/pot</TableHead>
                    <TableHead className="text-right">Marge %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((p) => {
                    const isOpen = expandedProduct === p.productId;
                    return (
                      <React.Fragment key={p.productId}>
                        <TableRow
                          className="cursor-pointer hover:bg-muted/40"
                          onClick={() => setExpandedProduct(isOpen ? null : p.productId)}
                        >
                          <TableCell className="font-medium text-sm">
                            <div className="flex items-center gap-1.5">
                              {isOpen ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                              {p.name}
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-sm font-mono">{formatEuro(p.caProduct)}</TableCell>
                          <TableCell className="text-right text-sm font-mono hidden sm:table-cell">{p.nbPots.toLocaleString('fr-FR')}</TableCell>
                          <TableCell className="text-right text-sm font-mono">{formatEuro(p.prixVenteMoyenParPot)}</TableCell>
                          <TableCell className="text-right text-sm font-mono hidden md:table-cell">{p.achatParPot !== null ? formatEuro(p.achatParPot) : '—'}</TableCell>
                          <TableCell className="text-right text-sm font-mono text-muted-foreground hidden md:table-cell">{formatEuro(p.chargesParPot)}</TableCell>
                          <TableCell className="text-right text-sm font-mono font-semibold">
                            {p.margeNetteParPot !== null ? (
                              <span className={p.margeNetteParPot >= 0 ? 'text-emerald-600' : 'text-destructive'}>{formatEuro(p.margeNetteParPot)}</span>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="text-right text-sm font-mono">
                            {p.margePct !== null ? (
                              <span className={p.margePct >= 0 ? 'text-emerald-600' : 'text-destructive'}>{p.margePct.toFixed(1)}%</span>
                            ) : '—'}
                          </TableCell>
                        </TableRow>
                        {isOpen && (
                          <TableRow className="bg-muted/20">
                            <TableCell colSpan={8} className="p-3">
                              <div className="rounded-md border border-border bg-card p-3 space-y-2">
                                <p className="text-xs font-medium text-muted-foreground">Détail du calcul — {p.name}</p>
                                <div className="grid gap-1.5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 text-xs">
                                  <DetailRow label="Format" value={p.format} />
                                  <DetailRow label="Pots par colis" value={String(p.potsPerColis)} />
                                  <DetailRow label="Colis vendus (période)" value={p.nbColis.toLocaleString('fr-FR')} />
                                  <DetailRow label="Pots vendus" value={p.nbPots.toLocaleString('fr-FR')} />
                                  <DetailRow label="CA période" value={formatEuro(p.caProduct)} />
                                  <DetailRow label="Prix vente moyen / pot" value={formatEuro(p.prixVenteMoyenParPot)} />
                                  <DetailRow label="Prix d'achat / pot" value={p.achatParPot !== null ? formatEuro(p.achatParPot) : '—'} />
                                  <DetailRow label="Prix d'achat / colis" value={p.achatParColis !== null ? formatEuro(p.achatParColis) : '—'} />
                                  <DetailRow label="Marge brute / pot (avant charges)" value={p.margeBruteParPot !== null ? formatEuro(p.margeBruteParPot) : '—'} highlight />
                                  <DetailRow label="Charges directes allouées / pot" value={formatEuro(p.chargesParPot)} highlight />
                                  <DetailRow label="Marge nette / pot (après charges)" value={p.margeNetteParPot !== null ? formatEuro(p.margeNetteParPot) : '—'} highlight />
                                  <DetailRow label="Marge nette %" value={p.margePct !== null ? `${p.margePct.toFixed(1)}%` : '—'} highlight />
                                </div>
                                <p className="text-[11px] text-muted-foreground pt-1 border-t border-border">
                                  Méthode : charges directes TTC (Transport{includeMarketing ? ' + Marketing' : ''}{includeCatalogues ? ' + Catalogues' : ''}{includeImprimes ? ' + Imprimés' : ''}) allouées au prorata du CA du produit sur la période, puis ramenées au pot.
                                </p>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange?: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange?.(!on)}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
        on
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-card text-muted-foreground border-border hover:bg-muted'
      } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-white' : 'bg-muted-foreground'}`} />
      {label}
    </button>
  );
}

function MiniStat({ label, value, accent, small }: { label: string; value: string; accent?: string; small?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-card px-2.5 py-1.5">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`font-mono font-semibold ${small ? 'text-xs' : 'text-sm'} ${accent === 'primary' ? 'text-primary' : ''}`}>{value}</p>
    </div>
  );
}

function DetailRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded px-2 py-1 ${highlight ? 'bg-primary/5 border border-primary/20' : ''}`}>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`font-mono text-xs font-medium ${highlight ? 'text-primary' : ''}`}>{value}</p>
    </div>
  );
}
