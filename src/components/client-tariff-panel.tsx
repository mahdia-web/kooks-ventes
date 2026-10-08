'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Users, Euro, TrendingUp } from 'lucide-react';
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
  product?: Product;
}
interface Enseigne { id: string; name: string; type: string; agent: string; isActive: boolean; }

export function ClientTariffPanel() {
  const [enseignes, setEnseignes] = useState<Enseigne[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedEnseigne, setSelectedEnseigne] = useState('');
  const [salesPrices, setSalesPrices] = useState<SalesPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProductId, setNewProductId] = useState('');
  const [newTarif, setNewTarif] = useState('');
  const [newRemise, setNewRemise] = useState('0');

  const loadEnseignes = useCallback(async () => {
    try { const r = await fetch('/api/enseignes'); const j = await r.json(); if (j.ok) setEnseignes(j.data.filter((e: Enseigne) => e.isActive)); } catch {}
  }, []);

  const loadProducts = useCallback(async () => {
    try {
      const r = await fetch('/api/products?withPrices=true&active=true');
      const j = await r.json();
      if (j.ok) setProducts(j.data.filter((p: Product) => p.parfum && p.format));
    } catch {}
  }, []);

  const loadSalesPrices = useCallback(async (enseigne: string) => {
    if (!enseigne) { setSalesPrices([]); return; }
    try {
      const r = await fetch(`/api/products/sales-prices?enseigne=${encodeURIComponent(enseigne)}`);
      const j = await r.json();
      if (j.ok) {
        // Enrichir avec les infos produit (purchase prices)
        const enriched = j.data.map((sp: SalesPrice) => {
          const product = products.find(p => p.id === sp.productId);
          return { ...sp, product };
        });
        setSalesPrices(enriched);
      }
    } catch {}
  }, [products]);

  useEffect(() => { Promise.all([loadEnseignes(), loadProducts()]).then(() => setLoading(false)); }, [loadEnseignes, loadProducts]);
  useEffect(() => { loadSalesPrices(selectedEnseigne); }, [selectedEnseigne, loadSalesPrices]);

  const assignedProductIds = new Set(salesPrices.map(sp => sp.productId));
  const availableProducts = products.filter(p => !assignedProductIds.has(p.id));

  const addTariff = async () => {
    if (!newProductId || !selectedEnseigne) { toast.error('Sélectionnez un produit'); return; }
    const tarif = parseFloat(newTarif);
    const remise = parseFloat(newRemise) || 0;
    if (isNaN(tarif) || tarif <= 0) { toast.error('Tarif invalide'); return; }
    try {
      const res = await fetch('/api/products/sales-prices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: newProductId, enseigne: selectedEnseigne, tarifDepart: tarif, remisePercent: remise }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      toast.success('Tarif ajouté', { description: `${formatEuro(tarif)} - ${remise}% = ${formatEuro(tarif * (1 - remise / 100))}` });
      setNewProductId(''); setNewTarif(''); setNewRemise('0'); setShowAddForm(false);
      loadSalesPrices(selectedEnseigne);
    } catch (e: any) { toast.error(e.message); }
  };

  const deleteTariff = async (id: string) => {
    if (!confirm('Supprimer ce tarif ?')) return;
    try {
      const res = await fetch(`/api/products/sales-prices/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      toast.success('Tarif supprimé');
      loadSalesPrices(selectedEnseigne);
    } catch (e: any) { toast.error(e.message); }
  };

  if (loading) return <Card><CardContent className="p-8 text-center text-muted-foreground">Chargement...</CardContent></Card>;

  return (
    <div className="space-y-4">
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-3 text-xs text-muted-foreground">
          <strong>Grille tarifaire clients.</strong> Sélectionnez un client pour voir et gérer
          les produits qu'il achète. Affiche le prix d'achat, la marge, et le prix final au format / colis / palette.
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="font-title flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" /> Sélectionner un client
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedEnseigne || '__none__'} onValueChange={(v) => setSelectedEnseigne(v === '__none__' ? '' : v)}>
            <SelectTrigger className="w-full max-w-md"><SelectValue placeholder="— Choisir un client —" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— Choisir un client —</SelectItem>
              {enseignes.map((e) => <SelectItem key={e.id} value={e.name}>{e.name} ({e.type})</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedEnseigne && (
        <Card className="border-border">
          <CardHeader>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <CardTitle className="font-title">Tarifs de {selectedEnseigne}</CardTitle>
                <CardDescription>{salesPrices.length} produit(s) affecté(s) • prix final = tarif × (1 − remise%)</CardDescription>
              </div>
              <Button size="sm" onClick={() => setShowAddForm(!showAddForm)} disabled={availableProducts.length === 0} className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="h-4 w-4 mr-2" /> Affecter un produit
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {showAddForm && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 grid gap-2 sm:grid-cols-4 items-end">
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs font-medium">Produit (parfum × format)</Label>
                  <Select value={newProductId || '__none__'} onValueChange={setNewProductId}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Choisir" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Choisir —</SelectItem>
                      {availableProducts.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Tarif départ €</Label>
                  <Input type="number" step="0.01" value={newTarif} onChange={(e) => setNewTarif(e.target.value)} placeholder="Ex: 14.784" className="h-8 text-sm" />
                </div>
                <div className="flex gap-2">
                  <div className="space-y-1 flex-1">
                    <Label className="text-xs font-medium">Remise %</Label>
                    <Input type="number" step="0.1" value={newRemise} onChange={(e) => setNewRemise(e.target.value)} placeholder="0" className="h-8 text-sm" />
                  </div>
                  <Button size="sm" onClick={addTariff} className="bg-primary text-primary-foreground hover:bg-primary/90 h-8">
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}

            {salesPrices.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Aucun produit affecté. Cliquez sur « Affecter un produit ».
              </p>
            ) : (
              <div className="rounded-md border border-border overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted">
                    <TableRow>
                      <TableHead>Produit</TableHead>
                      <TableHead className="text-right">Tarif</TableHead>
                      <TableHead className="text-right">Remise</TableHead>
                      <TableHead className="text-right">Prix final</TableHead>
                      <TableHead className="text-right hidden md:table-cell">Au format</TableHead>
                      <TableHead className="text-right hidden lg:table-cell">À la palette</TableHead>
                      <TableHead className="text-right">Achat</TableHead>
                      <TableHead className="text-right">Marge</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salesPrices.map((sp) => {
                      const product = products.find(p => p.id === sp.productId);
                      const currentPrice = product?.purchasePrices?.find(pp => pp.endDate === null);
                      const fmt = product?.format;
                      const finalColis = sp.finalPrice;
                      const finalFormat = fmt?.potsPerFormat ? finalColis / (fmt.potsPerColis / fmt.potsPerFormat) : finalColis;
                      const finalPalette = fmt?.colisPerPalette ? finalColis * fmt.colisPerPalette : null;
                      const achat = currentPrice?.pricePerColis ?? null;
                      const marge = achat !== null ? finalColis - achat : null;
                      const margePct = marge !== null && finalColis > 0 ? (marge / finalColis) * 100 : null;

                      return (
                        <TableRow key={sp.id}>
                          <TableCell className="font-medium text-sm">{sp.product?.name ?? sp.productId}</TableCell>
                          <TableCell className="text-right text-sm">{formatEuro(sp.tarifDepart)}</TableCell>
                          <TableCell className="text-right text-sm">{sp.remisePercent.toFixed(1)}%</TableCell>
                          <TableCell className="text-right font-semibold text-primary text-sm">{formatEuro(finalColis)}</TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground hidden md:table-cell">
                            {finalFormat ? formatEuro(finalFormat) : '—'}
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground hidden lg:table-cell">
                            {finalPalette ? formatEuro(finalPalette) : '—'}
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {achat !== null ? formatEuro(achat) : '—'}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {marge !== null ? (
                              <div>
                                <div className={marge >= 0 ? 'font-medium text-emerald-600' : 'font-medium text-destructive'}>
                                  {formatEuro(marge)}
                                </div>
                                {margePct !== null && <div className="text-[10px] text-muted-foreground">{margePct.toFixed(1)}%</div>}
                              </div>
                            ) : '—'}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" onClick={() => deleteTariff(sp.id)} className="h-7 w-7 text-destructive hover:bg-destructive/10" title="Supprimer">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
