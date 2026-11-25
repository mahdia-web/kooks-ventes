'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { formatEuro } from '@/lib/dashboard-service';
import { ArrowRight, ArrowLeft, RefreshCw, Pencil, Check, X } from 'lucide-react';

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

interface SalaireLine {
  id: string;
  category: string;
  subLabel: string | null;
  vendor: string | null;
  date: string;
  amountHT: number;
  amountTTC: number;
  vatRate: number | null;
  allocationMethod: string;
  excludedFromMargin: boolean;
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
  const [salaireLines, setSalaireLines] = useState<SalaireLine[]>([]);
  // Édition inline d'un montant de salaire : { id, value }
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

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
        setSalaireLines(json.salaireLines || []);
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

  // Toggle d'affectation individuelle d'une ligne de salaire à la marge.
  // excluded = true → la ligne est retirée de la marge estimée.
  const toggleSalaire = async (id: string, currentExcluded: boolean) => {
    setSavingId(id);
    try {
      const res = await fetch(`/api/charges/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ excludedFromMargin: !currentExcluded }),
      });
      const json = await res.json();
      if (json.ok) {
        // Mise à jour locale immédiate + rechargement pour cohérence des totaux
        setSalaireLines(prev => prev.map(l => l.id === id ? { ...l, excludedFromMargin: !currentExcluded } : l));
        toast.success(!currentExcluded ? 'Salaire retiré de la marge' : 'Salaire réintégré dans la marge');
        onReclassified(); // recalcul de la marge
      } else {
        toast.error(json.error || 'Erreur lors du toggle');
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingId(null);
    }
  };

  // Sauvegarde du montant TTC édité d'une ligne de salaire.
  // Le HT est recalculé côté API à partir du taux de TVA.
  const saveMontant = async (id: string) => {
    if (!editing) return;
    const newTTC = parseFloat(editing.value.replace(',', '.'));
    if (Number.isNaN(newTTC) || newTTC < 0) {
      toast.error('Montant invalide');
      return;
    }
    setSavingId(id);
    try {
      const res = await fetch(`/api/charges/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountTTC: newTTC }),
      });
      const json = await res.json();
      if (json.ok) {
        // Mise à jour locale + rechargement pour cohérence des totaux
        setSalaireLines(prev => prev.map(l => l.id === id ? { ...l, amountTTC: json.data.amountTTC, amountHT: json.data.amountHT } : l));
        toast.success('Montant mis à jour');
        setEditing(null);
        onReclassified(); // recalcul de la marge
      } else {
        toast.error(json.error || 'Erreur lors de la sauvegarde');
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingId(null);
    }
  };

  const directCharges = charges.filter(c => c.allocationMethod === 'DIRECT');
  const indirectCharges = charges.filter(c => c.allocationMethod !== 'DIRECT');
  const totalDirect = directCharges.reduce((s, c) => s + c.amountTTC, 0);
  const totalIndirect = indirectCharges.reduce((s, c) => s + c.amountTTC, 0);
  const total = totalDirect + totalIndirect;

  // Totaux salaires
  const salairesTotal = salaireLines.reduce((s, l) => s + l.amountTTC, 0);
  const salairesIncluded = salaireLines.filter(l => !l.excludedFromMargin).reduce((s, l) => s + l.amountTTC, 0);
  const salairesExcluded = salairesTotal - salairesIncluded;

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

      {/* === Section Salaires : affectation individuelle + édition du montant === */}
      {salaireLines.length > 0 && (
        <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h5 className="text-xs font-semibold text-violet-700">Salaires — affectation individuelle</h5>
              <p className="text-[11px] text-muted-foreground">
                Coche une ligne pour l'<span className="font-medium text-foreground">affecter</span> à la marge, décoche pour la{' '}
                <span className="font-medium text-foreground">retirer</span>. Clique sur le montant pour le modifier. La marge HS/AS se recalcule automatiquement.
              </p>
            </div>
            <div className="text-right text-[11px]">
              <div className="text-muted-foreground">
                Total : <span className="font-medium text-foreground">{formatEuro(salairesTotal)}</span>
              </div>
              <div className="text-emerald-600">
                Affectés : <span className="font-medium">{formatEuro(salairesIncluded)}</span>
              </div>
              {salairesExcluded > 0 && (
                <div className="text-muted-foreground/70 line-through">
                  Retirés : {formatEuro(salairesExcluded)}
                </div>
              )}
            </div>
          </div>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {salaireLines.map(l => {
              const isEditingThis = editing?.id === l.id;
              const isSavingThis = savingId === l.id;
              return (
                <div
                  key={l.id}
                  className={`flex items-center gap-2 p-1.5 rounded-md border text-xs ${
                    l.excludedFromMargin
                      ? 'border-muted bg-muted/30 opacity-60'
                      : 'border-violet-200 bg-card'
                  }`}
                >
                  {/* Toggle d'affectation (checkbox) */}
                  <input
                    type="checkbox"
                    checked={!l.excludedFromMargin}
                    onChange={() => toggleSalaire(l.id, l.excludedFromMargin)}
                    disabled={isSavingThis}
                    title={l.excludedFromMargin ? 'Réaffecter ce salaire à la marge' : 'Retirer ce salaire de la marge'}
                    className="h-3.5 w-3.5 accent-violet-600 cursor-pointer"
                  />
                  {/* Libellé + date */}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate" title={l.subLabel || l.vendor || l.category}>
                      {l.subLabel || l.vendor || l.category}
                      {l.vendor && l.subLabel && <span className="text-muted-foreground font-normal"> — {l.vendor}</span>}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(l.date).toLocaleDateString('fr-FR')}
                      {l.vatRate != null && ` • TVA ${(l.vatRate * 100).toFixed(0)}%`}
                      {l.excludedFromMargin && <span className="ml-1 text-muted-foreground/70">(retiré de la marge)</span>}
                    </div>
                  </div>
                  {/* Montant TTC éditable */}
                  {isEditingThis ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={editing.value}
                        onChange={e => setEditing({ id: l.id, value: e.target.value })}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveMontant(l.id);
                          if (e.key === 'Escape') setEditing(null);
                        }}
                        autoFocus
                        className="w-20 px-1 py-0.5 text-right text-xs border border-violet-300 rounded font-mono bg-card"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-emerald-600"
                        onClick={() => saveMontant(l.id)}
                        disabled={isSavingThis}
                        title="Valider"
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-muted-foreground"
                        onClick={() => setEditing(null)}
                        title="Annuler"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditing({ id: l.id, value: String(l.amountTTC.toFixed(2)) })}
                      disabled={isSavingThis}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-violet-100 font-mono text-xs"
                      title="Modifier le montant TTC"
                    >
                      {formatEuro(l.amountTTC)}
                      <Pencil className="h-3 w-3 text-muted-foreground" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

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
