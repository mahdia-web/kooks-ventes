'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, ChevronDown, ChevronRight, Euro, Store, Search } from 'lucide-react';
import { toast } from 'sonner';
import { formatEuro, formatNumber } from '@/lib/dashboard-service';

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
                            <TableHead className="text-right hidden md:table-cell">Marge/pot</TableHead>
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

                            return (
                              <TariffRow
                                key={sp.id}
                                sp={sp}
                                productName={product?.name ?? sp.productId}
                                margePot={margePot}
                                margeColis={margeColis}
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
  sp, productName, margePot, margeColis, finalPot, finalFormat, achatPot, achatColis,
  onUpdate, onDelete,
}: {
  sp: SalesPrice; productName: string;
  margePot: number | null; margeColis: number | null;
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
