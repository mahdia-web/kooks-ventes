'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Search, Loader2, AlertTriangle, MapPin } from 'lucide-react';
import { formatEuro } from '@/lib/dashboard-service';
import { toast } from 'sonner';

interface SalesSearchProps {
  /** Optional: limit search to a specific agent — defaults to "all" (search across ALL agents)
   * Important : pour retrouver une vente manquante, il vaut mieux NE PAS filtrer par agent
   * car la vente peut avoir été assignée à un agent différent (par ex. fallback KOOK'S
   * si l'agent dans le fichier n'est pas reconnu).
   */
  agentFilter?: string | null;
}

interface SearchResult {
  id: string;
  blNumber: string | null;
  date: string;
  enseigne: string;
  type: string;
  agent: string;
  amountHT: number;
  amountTTC: number;
  rate: number;
  commission: number;
  month: number;
  year: number;
}

interface MatchedEnseigne {
  name: string;
  type: string;
  agent: string;
  isActive: boolean;
  score: number;
  method: string;
  salesCount: number;
}

export function SalesSearch({ agentFilter }: SalesSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [matchedEnseignes, setMatchedEnseignes] = useState<MatchedEnseigne[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  // Par défaut : recherche sur TOUS les agents (pour retrouver une vente
  // qui aurait pu être assignée à un agent différent — ex: KOOK'S fallback)
  const [allAgents, setAllAgents] = useState(true);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setMessage(null);
    try {
      const params = new URLSearchParams({ q: query.trim(), limit: '100' });
      // Si l'utilisateur décoche "Tous les agents" ET qu'un filtre agent est actif
      // sur le dashboard, on restreint la recherche à cet agent
      if (!allAgents && agentFilter && agentFilter !== 'all') {
        params.set('agent', agentFilter);
      }
      const r = await fetch(`/api/sales/search?${params}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      setResults(j.results || []);
      setMatchedEnseignes(j.matchedEnseignes || []);
      setMessage(j.message || null);

      if ((j.results || []).length === 0 && !j.message) {
        toast.info(`Aucune vente trouvée pour "${query}"`);
      } else if ((j.results || []).length > 0) {
        toast.success(`${j.results.length} vente(s) trouvée(s) pour ${(j.matchedEnseignes || []).length} enseigne(s)`);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const methodLabel = (method: string) => {
    switch (method) {
      case 'exact': return 'Match exact';
      case 'normalized': return 'Normalisation';
      case 'contains': return 'Contient';
      case 'similar': return 'Similaire';
      default: return method;
    }
  };
  const methodColor = (method: string) => {
    switch (method) {
      case 'exact': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400';
      case 'normalized': return 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400';
      case 'contains': return 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400';
      case 'similar': return 'bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400';
      default: return '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="border-primary/30 text-primary hover:bg-primary/10"
          title="Rechercher une vente dans toute la base (match fuzzy sur le nom du client)"
        >
          <Search className="h-3.5 w-3.5 mr-1.5" />
          Recherche vente
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Recherche globale de ventes</DialogTitle>
          <DialogDescription>
            Recherche fuzzy sur le nom du client dans toutes les ventes (toutes périodes confondues).
            Utile pour retrouver une vente qui aurait pu être importée sous un nom légèrement différent
            (ex : « AUCHAN MANDELIEU » vs « AUCHAN - MANDALIEU »).
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 py-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder="Ex: AUCHAN MANDELIEU, SCAPEST, MONOPRIX..."
            className="flex-1"
            autoFocus
          />
          <Button onClick={search} disabled={loading || !query.trim()}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
            Rechercher
          </Button>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground pb-2">
          <input
            type="checkbox"
            id="allAgents"
            checked={allAgents}
            onChange={(e) => setAllAgents(e.target.checked)}
            className="accent-primary"
          />
          <label htmlFor="allAgents">
            Rechercher sur <strong>tous les commerciaux</strong> (recommandé pour retrouver une vente manquante)
          </label>
          {!allAgents && agentFilter && agentFilter !== 'all' && (
            <span className="ml-2 px-1.5 py-0.5 rounded bg-muted text-foreground">
              Limité à : {agentFilter}
            </span>
          )}
        </div>

        {/* Enseignes correspondantes */}
        {matchedEnseignes.length > 0 && (
          <Card className="border-border">
            <CardHeader className="py-2 px-3">
              <CardTitle className="text-sm">
                <MapPin className="h-3.5 w-3.5 inline mr-1" />
                Clients correspondants ({matchedEnseignes.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="py-2 px-3">
              <div className="space-y-1.5">
                {matchedEnseignes.map((m) => (
                  <div key={m.name} className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant="outline" className={`text-[10px] ${methodColor(m.method)}`}>
                        {methodLabel(m.method)}
                      </Badge>
                      <span className="font-medium truncate">{m.name}</span>
                      <span className="text-muted-foreground">({m.score.toFixed(2)})</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span>{m.type}</span>
                      <span>•</span>
                      <span>{m.agent || "KOOK'S"}</span>
                      <span>•</span>
                      <span className="font-medium text-foreground">{m.salesCount} ventes</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Message d'information */}
        {message && (
          <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800 dark:text-amber-300">{message}</p>
          </div>
        )}

        {/* Résultats des ventes */}
        {results.length > 0 && (
          <Card className="border-border">
            <CardHeader className="py-2 px-3">
              <CardTitle className="text-sm">
                Ventes trouvées ({results.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="py-2 px-3">
              <div className="max-h-96 overflow-y-auto rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left p-2 font-medium">Date</th>
                      <th className="text-left p-2 font-medium">Enseigne</th>
                      <th className="text-left p-2 font-medium">Type</th>
                      <th className="text-left p-2 font-medium">Agent</th>
                      <th className="text-left p-2 font-medium">N° BL</th>
                      <th className="text-right p-2 font-medium">MT HT</th>
                      <th className="text-right p-2 font-medium">Commission</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <tr key={r.id} className="border-t border-border hover:bg-muted/50">
                        <td className="p-2 text-muted-foreground">
                          {new Date(r.date).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="p-2 font-medium truncate max-w-[180px]">{r.enseigne}</td>
                        <td className="p-2">
                          <Badge variant="outline" className="text-[10px]">{r.type}</Badge>
                        </td>
                        <td className="p-2 text-muted-foreground">{r.agent}</td>
                        <td className="p-2 text-muted-foreground">{r.blNumber || '—'}</td>
                        <td className="p-2 text-right font-mono">{formatEuro(r.amountHT)}</td>
                        <td className="p-2 text-right font-mono text-destructive">{formatEuro(r.commission)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
