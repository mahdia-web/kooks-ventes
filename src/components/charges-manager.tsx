'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { formatEuro } from '@/lib/dashboard-service';
import { ArrowRight, ArrowLeft, RefreshCw } from 'lucide-react';

interface ChargeCat {
  category: string;
  amountTTC: number;
  amountHT: number;
  count: number;
  allocationMethod: 'DIRECT' | 'GLOBAL' | 'PROPORTIONAL';
  directCount: number;
  indirectCount: number;
  proportionalCount: number;
  enseignes: string[];
}

interface ChargesManagerProps {
  startDate: string; // JJ/MM/AAAA
  endDate: string;   // JJ/MM/AAAA
  onReclassified: () => void; // déclenche le recalcul de la marge
}

/**
 * Section "Gestion des charges" de la grille tarifaire.
 *
 * Liste les charges de la période par catégorie, groupées en deux colonnes:
 *  - DIRECTES (allouées au prorata du CA dans le calcul de marge)
 *  - INDIRECTES (GLOBAL/PROPORTIONAL, non ventilées par produit)
 *
 * L'utilisateur peut basculer une catégorie entière d'une colonne à l'autre
 * via un bouton flèche. Après chaque bascule, onReclassified() est appelé pour
 * recalculer la marge automatiquement.
 */
export function ChargesManager({ startDate, endDate, onReclassified }: ChargesManagerProps) {
  const [charges, setCharges] = useState<ChargeCat[]>([]);
  const [loading, setLoading] = useState(false);
  const [reclassifying, setReclassifying] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/products/marge-estimee/charges-summary?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
        { cache: 'no-store' }
      );
      const json = await res.json();
      if (json.ok) {
        setCharges(json.charges);
      } else {
        toast.error(json.error || 'Erreur chargement charges');
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    load();
  }, [load]);

  const reclassify = async (category: string, newMethod: 'DIRECT' | 'GLOBAL') => {
    setReclassifying(category);
    try {
      const res = await fetch('/api/charges/reclassify-category', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, startDate, endDate, allocationMethod: newMethod }),
      });
      const json = await res.json();
      if (json.ok) {
        toast.success(`"${category}" → ${newMethod === 'DIRECT' ? 'Directe' : 'Indirecte'} (${json.updated} lignes)`);
        await load();
        onReclassified(); // recalcul de la marge
      } else {
        toast.error(json.error || 'Erreur reclassification');
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setReclassifying(null);
    }
  };

  const directCharges = charges.filter(c => c.allocationMethod === 'DIRECT');
  const indirectCharges = charges.filter(c => c.allocationMethod !== 'DIRECT');
  const totalDirect = directCharges.reduce((s, c) => s + c.amountTTC, 0);
  const totalIndirect = indirectCharges.reduce((s, c) => s + c.amountTTC, 0);
  const total = totalDirect + totalIndirect;

  return (
    <div className="border border-border rounded-lg bg-card p-3 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h4 className="text-sm font-semibold">Gestion des charges — directes vs indirectes</h4>
          <p className="text-[11px] text-muted-foreground">
            Bascule une catégorie entre <span className="font-medium text-foreground">directe</span> (allouée au prorata du CA dans la marge) et{' '}
            <span className="font-medium text-foreground">indirecte</span> (non ventilée). La marge est recalculée automatiquement.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading} className="h-7 text-xs">
          <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </Button>
      </div>

      {/* Barre de répartition */}
      {total > 0 && (
        <div className="flex h-6 rounded-md overflow-hidden border border-border">
          <div
            className="bg-blue-500/80 flex items-center justify-center text-white text-[10px] font-medium"
            style={{ width: `${(totalDirect / total) * 100}%` }}
            title={`Directes: ${formatEuro(totalDirect)}`}
          >
            {totalDirect / total > 0.15 ? `${Math.round((totalDirect / total) * 100)}% direct` : ''}
          </div>
          <div
            className="bg-amber-500/80 flex items-center justify-center text-white text-[10px] font-medium"
            style={{ width: `${(totalIndirect / total) * 100}%` }}
            title={`Indirectes: ${formatEuro(totalIndirect)}`}
          >
            {totalIndirect / total > 0.15 ? `${Math.round((totalIndirect / total) * 100)}% indirect` : ''}
          </div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {/* Colonne DIRECTES */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between sticky top-0 bg-card pb-1 border-b border-border">
            <span className="text-xs font-semibold text-blue-600">Charges directes</span>
            <span className="text-xs font-medium">{formatEuro(totalDirect)}</span>
          </div>
          {directCharges.length === 0 && (
            <p className="text-[11px] text-muted-foreground py-2">Aucune charge directe sur la période.</p>
          )}
          {directCharges.map(c => (
            <div key={c.category} className="flex items-center gap-2 p-2 rounded-md bg-blue-50/50 border border-blue-200/50">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate" title={c.category}>{c.category}</div>
                <div className="text-[10px] text-muted-foreground">
                  {formatEuro(c.amountTTC)} TTC • {c.count} ligne{c.count > 1 ? 's' : ''}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[10px] text-amber-600 hover:bg-amber-50"
                disabled={reclassifying === c.category}
                onClick={() => reclassify(c.category, 'GLOBAL')}
                title="Rendre indirecte"
              >
                <ArrowRight className="h-3 w-3" />
                <span className="ml-1 hidden sm:inline">Indirecte</span>
              </Button>
            </div>
          ))}
        </div>

        {/* Colonne INDIRECTES */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between sticky top-0 bg-card pb-1 border-b border-border">
            <span className="text-xs font-semibold text-amber-600">Charges indirectes</span>
            <span className="text-xs font-medium">{formatEuro(totalIndirect)}</span>
          </div>
          {indirectCharges.length === 0 && (
            <p className="text-[11px] text-muted-foreground py-2">Aucune charge indirecte sur la période.</p>
          )}
          {indirectCharges.map(c => (
            <div key={c.category} className="flex items-center gap-2 p-2 rounded-md bg-amber-50/50 border border-amber-200/50">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[10px] text-blue-600 hover:bg-blue-50"
                disabled={reclassifying === c.category}
                onClick={() => reclassify(c.category, 'DIRECT')}
                title="Rendre directe"
              >
                <ArrowLeft className="h-3 w-3" />
                <span className="ml-1 hidden sm:inline">Directe</span>
              </Button>
              <div className="flex-1 min-w-0 text-right">
                <div className="text-xs font-medium truncate" title={c.category}>{c.category}</div>
                <div className="text-[10px] text-muted-foreground">
                  {formatEuro(c.amountTTC)} TTC • {c.count} ligne{c.count > 1 ? 's' : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
