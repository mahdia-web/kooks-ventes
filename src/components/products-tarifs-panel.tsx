'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Package, ChevronLeft, Trash2, Euro, Edit } from 'lucide-react';
import { toast } from 'sonner';
import { formatEuro } from '@/lib/dashboard-service';

// Types
interface Parfum { id: string; name: string; }
interface Format {
  id: string; name: string; potsPerColis: number; potsPerFormat: number | null;
  unitesFormatPerColis: number | null; colisPerPalette: number | null; potsPerPalette: number | null;
}
interface PurchasePrice { id: string; pricePerPot: number; pricePerFormat: number | null; pricePerColis: number; endDate: string | null; }
interface Product {
  id: string; name: string; parfumId: string | null; formatId: string | null;
  parfum?: Parfum; format?: Format;
  isActive: boolean;
  purchasePrices?: PurchasePrice[];
  salesPrices?: Array<{ id: string; enseigne: string; tarifDepart: number; remisePercent: number; finalPrice: number; }>;
}

const PARFUM_ORDER = ['Original', 'Peanut Butter', 'Crispy Choco', 'Caramel Pecan', 'Speculoos', 'Coco'];

export function ProductsTarifsPanel() {
  const [formats, setFormats] = useState<Format[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [parfums, setParfums] = useState<Parfum[]>([]);
  const [selectedFormatId, setSelectedFormatId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddParfum, setShowAddParfum] = useState(false);
  const [newParfumId, setNewParfumId] = useState('');
  const [newPotPrice, setNewPotPrice] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [fmtRes, prodRes, parRes] = await Promise.all([
        fetch('/api/formats'),
        fetch('/api/products?withPrices=true'),
        fetch('/api/parfums'),
      ]);
      const fmtJson = await fmtRes.json();
      const prodJson = await prodRes.json();
      const parJson = await parRes.json();
      if (fmtJson.ok) setFormats(fmtJson.data);
      if (prodJson.ok) setProducts(prodJson.data);
      if (parJson.ok) setParfums(parJson.data);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const selectedFormat = formats.find(f => f.id === selectedFormatId);
  const formatProducts = products.filter(p => p.formatId === selectedFormatId && p.parfumId);
  // Sort by parfum order
  formatProducts.sort((a, b) => {
    const ai = PARFUM_ORDER.indexOf(a.parfum?.name ?? '');
    const bi = PARFUM_ORDER.indexOf(b.parfum?.name ?? '');
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  if (loading) return <Card><CardContent className="p-8 text-center text-muted-foreground">Chargement...</CardContent></Card>;

  // === Vue détail d'un format ===
  if (selectedFormat && selectedFormatId) {
    const fmt = selectedFormat;
    const potsPerPalette = fmt.colisPerPalette && fmt.potsPerColis ? fmt.colisPerPalette * fmt.potsPerColis : fmt.potsPerPalette;
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={() => setSelectedFormatId(null)}>
          <ChevronLeft className="h-4 w-4 mr-2" /> Retour aux formats
        </Button>

        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="font-title text-xl">{fmt.name}</CardTitle>
            <CardDescription>
              {fmt.potsPerColis} pots/colis
              {fmt.potsPerFormat ? ` • ${fmt.potsPerFormat} pots/format` : ''}
              {fmt.unitesFormatPerColis ? ` • ${fmt.unitesFormatPerColis} formats/colis` : ''}
              {fmt.colisPerPalette ? ` • ${fmt.colisPerPalette} colis/palette` : ''}
              {potsPerPalette ? ` • ${potsPerPalette} pots/palette (auto)` : ''}
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-title">Parfums — Prix d'achat</CardTitle>
            <CardDescription>{formatProducts.length} parfum(s) disponible(s) pour ce format</CardDescription>
          </CardHeader>
          <CardContent>
            {formatProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Aucun parfum configuré pour ce format.
              </p>
            ) : (
              <div className="rounded-md border border-border overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted">
                    <TableRow>
                      <TableHead>Parfum</TableHead>
                      <TableHead className="text-right">Prix au pot</TableHead>
                      <TableHead className="text-right">Prix au format</TableHead>
                      <TableHead className="text-right">Prix au colis</TableHead>
                      <TableHead className="text-right">Tarifs vente</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {formatProducts.map((p) => {
                      const currentPrice = p.purchasePrices?.find(pp => pp.endDate === null);
                      const salesCount = p.salesPrices?.length ?? 0;
                      return (
                        <ParfumPriceRow
                          key={p.id}
                          product={p}
                          parfumName={p.parfum?.name ?? p.name}
                          currentPrice={currentPrice}
                          salesCount={salesCount}
                          onUpdate={loadData}
                        />
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Ajouter un parfum */}
            {showAddParfum ? (
              <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-3 grid gap-2 sm:grid-cols-3 items-end">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Parfum</Label>
                  <select
                    value={newParfumId}
                    onChange={(e) => setNewParfumId(e.target.value)}
                    className="h-8 text-sm w-full rounded-md border border-border bg-background px-2"
                  >
                    <option value="">— Choisir —</option>
                    {parfums
                      .filter(p => !formatProducts.some(fp => fp.parfumId === p.id))
                      .map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Prix au pot €</Label>
                  <Input type="number" step="0.001" value={newPotPrice} onChange={(e) => setNewPotPrice(e.target.value)} placeholder="Ex: 0.500" className="h-8 text-sm" />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setShowAddParfum(false)}>Annuler</Button>
                  <Button size="sm" onClick={async () => {
                    if (!newParfumId || !selectedFormatId) { toast.error('Sélectionnez un parfum'); return; }
                    const pot = parseFloat(newPotPrice);
                    if (isNaN(pot) || pot <= 0) { toast.error('Prix invalide'); return; }
                    try {
                      // Create product (parfum × format)
                      const res = await fetch('/api/products', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ parfumId: newParfumId, formatId: selectedFormatId }),
                      });
                      const json = await res.json();
                      if (!json.ok) throw new Error(json.error);
                      // Create purchase price
                      await fetch('/api/products/purchase-prices', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ productId: json.data.id, pricePerPot: pot }),
                      });
                      toast.success('Parfum ajouté', { description: `Prix au pot: ${formatEuro(pot)}` });
                      setNewParfumId(''); setNewPotPrice(''); setShowAddParfum(false);
                      loadData();
                    } catch (e: any) { toast.error(e.message); }
                  }} className="bg-primary text-primary-foreground hover:bg-primary/90 h-8">
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setShowAddParfum(true)} className="mt-3 w-full border-dashed">
                <Plus className="h-4 w-4 mr-2" /> Ajouter un parfum à ce format
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // === Vue principale : 4 cartes formats ===
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {formats.map((fmt) => {
          const productCount = products.filter(p => p.formatId === fmt.id && p.parfumId).length;
          const potsPerPalette = fmt.colisPerPalette && fmt.potsPerColis ? fmt.colisPerPalette * fmt.potsPerColis : null;
          return (
            <Card
              key={fmt.id}
              className="cursor-pointer hover:border-primary hover:shadow-md transition-all border-border"
              onClick={() => setSelectedFormatId(fmt.id)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <Package className="h-8 w-8 text-primary" />
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {productCount} parfum{productCount > 1 ? 's' : ''}
                  </span>
                </div>
                <CardTitle className="font-title text-lg mt-2">{fmt.name}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-1">
                <p><strong>{fmt.potsPerColis}</strong> pots/colis</p>
                {fmt.potsPerFormat && <p><strong>{fmt.potsPerFormat}</strong> pots/format</p>}
                {fmt.unitesFormatPerColis && <p><strong>{fmt.unitesFormatPerColis}</strong> formats/colis</p>}
                {fmt.colisPerPalette && <p><strong>{fmt.colisPerPalette}</strong> colis/palette</p>}
                {potsPerPalette && <p><strong>{potsPerPalette}</strong> pots/palette <span className="text-primary">(auto)</span></p>}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// === Ligne parfum avec prix d'achat éditable ===
function ParfumPriceRow({
  product,
  parfumName,
  currentPrice,
  salesCount,
  onUpdate,
}: {
  product: Product;
  parfumName: string;
  currentPrice?: PurchasePrice;
  salesCount: number;
  onUpdate: () => void;
}) {
  const [potPrice, setPotPrice] = useState(currentPrice ? currentPrice.pricePerPot.toFixed(3) : '');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setPotPrice(currentPrice ? currentPrice.pricePerPot.toFixed(3) : '');
  }, [currentPrice?.pricePerPot]);

  const savePrice = async () => {
    const pot = parseFloat(potPrice);
    if (isNaN(pot) || pot < 0) {
      toast.error('Prix invalide');
      return;
    }
    try {
      const res = await fetch('/api/products/purchase-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id, pricePerPot: pot }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      toast.success(`${parfumName}: prix mis à jour`, {
        description: `Pot: ${formatEuro(pot)} • Colis: ${formatEuro(json.data.pricePerColis)}`,
      });
      setEditing(false);
      onUpdate();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <TableRow>
      <TableCell className="font-medium">{parfumName}</TableCell>
      <TableCell className="text-right">
        {editing ? (
          <Input
            type="number"
            step="0.001"
            value={potPrice}
            onChange={(e) => setPotPrice(e.target.value)}
            onBlur={savePrice}
            onKeyDown={(e) => e.key === 'Enter' && savePrice()}
            className="h-7 w-20 text-xs text-right inline-block"
            autoFocus
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="font-mono text-sm hover:text-primary hover:underline"
          >
            {currentPrice ? `${currentPrice.pricePerPot.toFixed(3)}€` : '— cliquer —'}
          </button>
        )}
      </TableCell>
      <TableCell className="text-right text-muted-foreground">
        {currentPrice?.pricePerFormat ? `${currentPrice.pricePerFormat.toFixed(3)}€` : '—'}
      </TableCell>
      <TableCell className="text-right font-semibold text-primary">
        {currentPrice?.pricePerColis ? `${currentPrice.pricePerColis.toFixed(2)}€` : '—'}
      </TableCell>
      <TableCell className="text-right">
        <span className="text-xs text-muted-foreground">
          {salesCount > 0 ? `${salesCount} tarif(s)` : 'aucun'}
        </span>
      </TableCell>
    </TableRow>
  );
}
