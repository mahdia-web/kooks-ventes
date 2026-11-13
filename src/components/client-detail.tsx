'use client';

import { useState, useMemo } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Store,
  Search,
  Loader2,
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  Euro,
  Percent,
  Package,
  Calendar,
  Trophy,
  X,
} from 'lucide-react';
import { formatEuro, formatNumber, formatDate } from '@/lib/dashboard-service';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { toast } from 'sonner';

interface ClientDetailProps {
  /** Liste des enseignes (clients) disponibles — vient du dashboard */
  availableClients: string[];
  /** Filtre d'agent actif sur le dashboard (pour info) */
  agentFilter?: string;
}

interface ClientInfo {
  name: string;
  type: string;
  agent: string;
  commissionRate: number | null;
  isActive: boolean;
  oteraLocation: string | null;
}

interface ClientKpis {
  caHTTotal: number;
  caTTCTotal: number;
  commissionTotal: number;
  nbBl: number;
  panierMoyen: number;
  totalColis: number;
  caDirect: number;
  caCentrale: number;
  nbBlDirect: number;
  nbBlCentrale: number;
  firstOrder: string | null;
  lastOrder: string | null;
  daysSinceLastOrder: number;
  status: 'OK' | 'A RELANCER' | 'INACTIF';
}

interface MonthlyEvolution {
  year: number;
  month: number;
  caHT: number;
  nbBl: number;
  commission: number;
  label: string;
}

interface YearlySummary {
  year: number;
  caHT: number;
  nbBl: number;
  commission: number;
}

interface TopProduct {
  label: string;
  qty: number;
}

interface TopParfum {
  name: string;
  qty: number;
}

interface TopFormat {
  qty: number;
  label: string;
}

interface RecentSale {
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

interface ClientDetailData {
  info: ClientInfo;
  kpis: ClientKpis;
  monthlyEvolution: MonthlyEvolution[];
  yearlySummary: YearlySummary[];
  topProducts: TopProduct[];
  topParfums: TopParfum[];
  topFormats: TopFormat[];
  recentSales: RecentSale[];
  variantsMatched: string[];
}

const STATUS_COLORS: Record<string, string> = {
  'OK': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
  'A RELANCER': 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
  'INACTIF': 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400',
};

export function ClientDetail({ availableClients, agentFilter }: ClientDetailProps) {
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ClientDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Tri des clients par ordre alphabétique + filtre de recherche
  const sortedClients = useMemo(() => {
    const lower = search.trim().toLowerCase();
    return [...availableClients]
      .sort((a, b) => a.localeCompare(b))
      .filter((c) => !lower || c.toLowerCase().includes(lower));
  }, [availableClients, search]);

  const loadClient = async (clientName: string) => {
    if (!clientName) {
      setData(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/client-detail?enseigne=${encodeURIComponent(clientName)}`, {
        cache: 'no-store',
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'Erreur');
      setData(j.data);
      toast.success(`Fiche chargée : ${j.data.info.name}`, {
        description: `${j.data.kpis.nbBl} ventes • ${formatEuro(j.data.kpis.caHTTotal)}`,
      });
    } catch (e: any) {
      setError(e.message);
      toast.error('Erreur', { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  const clearSelection = () => {
    setSelectedClient('');
    setData(null);
    setError(null);
    setSearch('');
  };

  // Calcul de la variation mensuelle (dernier mois vs précédent)
  const monthlyTrend = useMemo(() => {
    if (!data || data.monthlyEvolution.length < 2) return null;
    const last = data.monthlyEvolution[data.monthlyEvolution.length - 1];
    const prev = data.monthlyEvolution[data.monthlyEvolution.length - 2];
    if (prev.caHT === 0) return null;
    return {
      value: ((last.caHT - prev.caHT) / prev.caHT) * 100,
      last,
      prev,
    };
  }, [data]);

  return (
    <div className="space-y-4">
      {/* Barre de sélection du client */}
      <Card className="border-border">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={open}
                  title={selectedClient || 'Sélectionner un client'}
                  className="h-10 justify-between min-w-[280px] max-w-[500px] flex-1 font-normal"
                >
                  <Store className="h-4 w-4 text-primary shrink-0" />
                  <span className="truncate flex-1 text-left">
                    {selectedClient || 'Sélectionner un client pour voir sa fiche détaillée...'}
                  </span>
                  <Search className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[500px] p-0" align="start">
                <Command shouldFilter={false}>
                  <div className="flex items-center border-b px-3">
                    <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                    <CommandInput
                      placeholder="Rechercher un client..."
                      value={search}
                      onValueChange={setSearch}
                      className="h-10 flex-1"
                      autoFocus
                    />
                  </div>
                  <CommandList className="max-h-[400px] overflow-y-auto">
                    <CommandEmpty>Aucun client trouvé.</CommandEmpty>
                    <CommandGroup>
                      {sortedClients.slice(0, 100).map((c) => (
                        <CommandItem
                          key={c}
                          value={c}
                          onSelect={() => {
                            setSelectedClient(c);
                            setOpen(false);
                            loadClient(c);
                          }}
                          className="break-words whitespace-normal py-2"
                        >
                          <Store className="h-3.5 w-3.5 mr-2 text-muted-foreground shrink-0" />
                          <span className="flex-1">{c}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {selectedClient && (
              <Button variant="ghost" size="sm" onClick={clearSelection} className="h-10">
                <X className="h-4 w-4 mr-1" />
                Effacer
              </Button>
            )}

            {agentFilter && agentFilter !== 'all' && !selectedClient && (
              <span className="text-xs text-muted-foreground">
                Liste filtrée sur l'agent : <strong>{agentFilter}</strong>
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* États : loading / error / empty / data */}
      {loading && (
        <Card className="border-border">
          <CardContent className="p-12 flex flex-col items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
            <p className="text-sm text-muted-foreground">Chargement de la fiche client...</p>
          </CardContent>
        </Card>
      )}

      {error && !loading && (
        <Card className="border-destructive">
          <CardContent className="p-6">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {!selectedClient && !loading && (
        <Card className="border-dashed border-border">
          <CardContent className="p-12 flex flex-col items-center justify-center text-center">
            <Store className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium">Aucun client sélectionné</p>
            <p className="text-xs text-muted-foreground mt-1">
              Sélectionnez un client ci-dessus pour afficher sa fiche détaillée :
              CA, BL, commission, évolution mensuelle, top produits et dernières ventes.
            </p>
          </CardContent>
        </Card>
      )}

      {data && !loading && !error && (
        <>
          {/* En-tête fiche client */}
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <CardTitle className="font-title text-xl break-words">{data.info.name}</CardTitle>
                  <CardDescription className="mt-1 flex items-center gap-2 flex-wrap">
                    <Badge variant="outline">{data.info.type}</Badge>
                    <Badge variant="outline" className={data.info.isActive ? 'border-emerald-400 text-emerald-700' : 'border-red-400 text-red-700'}>
                      {data.info.isActive ? 'Actif' : 'Inactif'}
                    </Badge>
                    {data.info.agent && (
                      <span className="text-xs">Agent : <strong>{data.info.agent}</strong></span>
                    )}
                    {data.info.commissionRate !== null && (
                      <span className="text-xs">Taux : <strong>{(data.info.commissionRate * 100).toFixed(1)}%</strong></span>
                    )}
                    {data.info.oteraLocation && (
                      <span className="text-xs">OTERA : {data.info.oteraLocation}</span>
                    )}
                  </CardDescription>
                  {data.variantsMatched.length > 1 && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {data.variantsMatched.length} variantes de nom détectées et fusionnées
                    </p>
                  )}
                </div>
                <Badge className={STATUS_COLORS[data.kpis.status]}>
                  {data.kpis.status}
                </Badge>
              </div>
            </CardHeader>
          </Card>

          {/* KPIs principaux */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Card><CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Euro className="h-3.5 w-3.5 text-primary" />
                <p className="text-xs text-muted-foreground uppercase">CA HT total</p>
              </div>
              <p className="text-lg font-title font-bold">{formatEuro(data.kpis.caHTTotal)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <ShoppingCart className="h-3.5 w-3.5 text-primary" />
                <p className="text-xs text-muted-foreground uppercase">NB BL</p>
              </div>
              <p className="text-lg font-title font-bold">{formatNumber(data.kpis.nbBl)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Euro className="h-3.5 w-3.5 text-destructive" />
                <p className="text-xs text-muted-foreground uppercase">Commission</p>
              </div>
              <p className="text-lg font-title font-bold text-destructive">{formatEuro(data.kpis.commissionTotal)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Percent className="h-3.5 w-3.5 text-primary" />
                <p className="text-xs text-muted-foreground uppercase">Panier moyen</p>
              </div>
              <p className="text-lg font-title font-bold">{formatEuro(data.kpis.panierMoyen)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Package className="h-3.5 w-3.5 text-primary" />
                <p className="text-xs text-muted-foreground uppercase">Colis</p>
              </div>
              <p className="text-lg font-title font-bold">{formatNumber(data.kpis.totalColis)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="h-3.5 w-3.5 text-primary" />
                <p className="text-xs text-muted-foreground uppercase">Dern. cmd</p>
              </div>
              <p className="text-sm font-title font-bold">
                {data.kpis.lastOrder ? formatDate(data.kpis.lastOrder) : '—'}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {data.kpis.daysSinceLastOrder === 9999 ? 'jamais' : `il y a ${data.kpis.daysSinceLastOrder} j`}
              </p>
            </CardContent></Card>
          </div>

          {/* Répartition Direct / Centrale + Tendance */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Répartition Direct / Centrale</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Direct</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{formatEuro(data.kpis.caDirect)}</span>
                    <span className="text-xs text-muted-foreground">({data.kpis.nbBlDirect} BL)</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Centrale</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{formatEuro(data.kpis.caCentrale)}</span>
                    <span className="text-xs text-muted-foreground">({data.kpis.nbBlCentrale} BL)</span>
                  </div>
                </div>
                <div className="pt-2 border-t">
                  <div className="flex h-3 rounded-full overflow-hidden bg-muted">
                    {data.kpis.caHTTotal > 0 && (
                      <>
                        <div
                          className="bg-primary"
                          style={{ width: `${(data.kpis.caDirect / data.kpis.caHTTotal) * 100}%` }}
                        />
                        <div
                          className="bg-primary/40"
                          style={{ width: `${(data.kpis.caCentrale / data.kpis.caHTTotal) * 100}%` }}
                        />
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Tendance mensuelle</CardTitle>
              </CardHeader>
              <CardContent>
                {monthlyTrend ? (
                  <div className="flex items-center gap-3">
                    {monthlyTrend.value >= 0 ? (
                      <TrendingUp className="h-8 w-8 text-emerald-600" />
                    ) : (
                      <TrendingDown className="h-8 w-8 text-red-600" />
                    )}
                    <div>
                      <p className="text-2xl font-bold">
                        {monthlyTrend.value >= 0 ? '+' : ''}{monthlyTrend.value.toFixed(1)}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {monthlyTrend.last.label} ({formatEuro(monthlyTrend.last.caHT)}) vs {monthlyTrend.prev.label} ({formatEuro(monthlyTrend.prev.caHT)})
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Données insuffisantes</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Résumé annuel</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {data.yearlySummary.map((y) => (
                    <div key={y.year} className="flex items-center justify-between text-xs">
                      <span className="font-medium">{y.year}</span>
                      <div className="flex items-center gap-2">
                        <span>{formatEuro(y.caHT)}</span>
                        <span className="text-muted-foreground">({y.nbBl} BL)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Évolution mensuelle (barres) */}
          {data.monthlyEvolution.length > 0 && (
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-sm">Évolution mensuelle du CA HT</CardTitle>
                <CardDescription>12 derniers mois avec données</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-1 h-40">
                  {data.monthlyEvolution.map((m) => {
                    const maxCa = Math.max(...data.monthlyEvolution.map((x) => x.caHT), 1);
                    const heightPct = (m.caHT / maxCa) * 100;
                    return (
                      <div key={`${m.year}-${m.month}`} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                        <div className="text-[9px] text-muted-foreground truncate w-full text-center">
                          {m.caHT > 0 ? formatEuro(m.caHT).replace(/\s/g, '') : ''}
                        </div>
                        <div className="w-full bg-muted rounded-t-sm overflow-hidden flex-1 flex items-end">
                          <div
                            className="w-full bg-primary rounded-t-sm transition-all"
                            style={{ height: `${heightPct}%`, minHeight: m.caHT > 0 ? '4px' : '0' }}
                          />
                        </div>
                        <div className="text-[9px] text-muted-foreground truncate w-full text-center">
                          {m.label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Top produits / parfums / formats */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {data.topProducts.length > 0 && (
              <Card className="border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Package className="h-4 w-4 text-primary" />
                    Top produits
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5">
                    {data.topProducts.map((p, i) => (
                      <div key={p.label} className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          {i === 0 && <Trophy className="h-3 w-3 text-amber-500 shrink-0" />}
                          <span className="truncate" title={p.label}>{p.label}</span>
                        </div>
                        <span className="font-medium shrink-0">{formatNumber(p.qty)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {data.topParfums.length > 0 && (
              <Card className="border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-primary" />
                    Top parfums
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5">
                    {data.topParfums.map((p, i) => (
                      <div key={p.name} className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          {i === 0 && <Trophy className="h-3 w-3 text-amber-500 shrink-0" />}
                          <span className="truncate" title={p.name}>{p.name}</span>
                        </div>
                        <span className="font-medium shrink-0">{formatNumber(p.qty)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {data.topFormats.length > 0 && (
              <Card className="border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Package className="h-4 w-4 text-primary" />
                    Top formats
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5">
                    {data.topFormats.map((f, i) => (
                      <div key={f.label} className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          {i === 0 && <Trophy className="h-3 w-3 text-amber-500 shrink-0" />}
                          <span className="truncate" title={f.label}>{f.label}</span>
                        </div>
                        <span className="font-medium shrink-0">{formatNumber(f.qty)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Dernières ventes */}
          {data.recentSales.length > 0 && (
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-sm">Dernières ventes</CardTitle>
                <CardDescription>{data.recentSales.length} plus récentes</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border border-border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>N° BL</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">MT HT</TableHead>
                        <TableHead className="text-right">Commission</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.recentSales.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="text-muted-foreground text-xs">
                            {formatDate(s.date)}
                          </TableCell>
                          <TableCell className="text-xs">{s.blNumber || '—'}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">{s.type}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">{formatEuro(s.amountHT)}</TableCell>
                          <TableCell className="text-right font-mono text-xs text-destructive">{formatEuro(s.commission)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
