'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Trophy, Medal, Award, Store, TrendingUp, Calendar } from 'lucide-react';
import { formatEuro, formatNumber, formatPercent, monthLabel } from '@/lib/dashboard-service';

interface OteraStore {
  enseigne: string;
  caHT: number;
  caTTC: number;
  commission: number;
  nbBL: number;
  firstOrder: string | null;
  lastOrder: string | null;
  agents: string[];
  aov: number;
  monthlyBreakdown: Array<{ month: string; caHT: number; nbBL: number }>;
}

interface OteraLocation {
  location: string;
  caHT: number;
  caTTC: number;
  commission: number;
  nbBL: number;
  stores: OteraStore[];
}

interface OteraData {
  period: { year: number; month: number } | null;
  locations: OteraLocation[];
  totalStores: number;
  totalCaHT: number;
  totalCommission: number;
  totalNbBL: number;
}

interface OteraDetailProps {
  year: number;
  month: number;
}

const RANK_ICONS = [
  <Trophy key="0" className="h-5 w-5 text-amber-500" />,
  <Medal key="1" className="h-5 w-5 text-slate-400" />,
  <Award key="2" className="h-5 w-4 text-orange-400" />,
];

export function OteraDetail({ year, month }: OteraDetailProps) {
  const [data, setData] = useState<OteraData | null>(null);
  const [scope, setScope] = useState<'month' | 'all'>('month');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      try {
        const url = scope === 'month'
          ? `/api/otera?year=${year}&month=${month}`
          : `/api/otera`;
        const res = await fetch(url);
        const json = await res.json();
        if (isMounted && json.ok) setData(json.data);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchData();
    return () => { isMounted = false; };
  }, [year, month, scope]);

  if (loading || !data) {
    return (
      <Card className="border-slate-200 dark:border-slate-800">
        <CardContent className="p-6">
          <p className="text-sm text-slate-500">Chargement des données OTERA...</p>
        </CardContent>
      </Card>
    );
  }

  if (data.locations.length === 0) {
    return (
      <Card className="border-slate-200 dark:border-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store className="h-5 w-5 text-emerald-600" />
            Magasins OTERA
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">Aucune vente OTERA pour cette période.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPIs synthétiques OTERA */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="border-emerald-200 dark:border-emerald-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase">CA HT OTERA</p>
                <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">
                  {formatEuro(data.totalCaHT)}
                </p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30">
                <TrendingUp className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-teal-200 dark:border-teal-800">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-slate-500 uppercase">Commission</p>
            <p className="text-xl font-bold text-teal-700 dark:text-teal-400">
              {formatEuro(data.totalCommission)}
            </p>
            <p className="text-xs text-slate-500">
              Taux moyen 5%
            </p>
          </CardContent>
        </Card>
        <Card className="border-cyan-200 dark:border-cyan-800">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-slate-500 uppercase">Nombre de BL</p>
            <p className="text-xl font-bold text-cyan-700 dark:text-cyan-400">
              {formatNumber(data.totalNbBL)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-violet-200 dark:border-violet-800">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-slate-500 uppercase">Magasins actifs</p>
            <p className="text-xl font-bold text-violet-700 dark:text-violet-400">
              {formatNumber(data.totalStores)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Toggle scope */}
      <div className="flex justify-end">
        <Tabs value={scope} onValueChange={(v) => setScope(v as 'month' | 'all')}>
          <TabsList className="bg-slate-100 dark:bg-slate-800 h-auto">
            <TabsTrigger
              value="month"
              className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 text-xs h-7"
            >
              <Calendar className="h-3 w-3 mr-1" />
              {monthLabel(month)} {year}
            </TabsTrigger>
            <TabsTrigger
              value="all"
              className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 text-xs h-7"
            >
              Tout l'historique
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Classement des magasins par localisation */}
      <Card className="border-slate-200 dark:border-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Store className="h-5 w-5 text-emerald-600" />
            Classement des magasins OTERA par performance
          </CardTitle>
          <CardDescription>
            {scope === 'month'
              ? `Performance pour ${monthLabel(month)} ${year}`
              : 'Performance cumulée sur toute la période disponible'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.locations.map((loc, idx) => (
              <div key={loc.location} className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
                {/* En-tête localisation */}
                <div className={`flex items-center justify-between gap-3 px-4 py-3 ${idx === 0 ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-slate-50 dark:bg-slate-900'}`}>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      {idx < 3 ? RANK_ICONS[idx] : <span className="text-sm font-bold text-slate-600">{idx + 1}</span>}
                    </div>
                    <div>
                      {/* Nom de la localisation en GRAND caractère */}
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                        {loc.location}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {loc.stores.length} enseigne(s) • {formatNumber(loc.nbBL)} BL • Commission: {formatEuro(loc.commission)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                      {formatEuro(loc.caHT)}
                    </p>
                    <p className="text-xs text-slate-500">CA HT</p>
                  </div>
                </div>

                {/* Détail des enseignes de cette localisation */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Enseigne</TableHead>
                      <TableHead className="text-right">BL</TableHead>
                      <TableHead className="text-right">CA HT</TableHead>
                      <TableHead className="text-right hidden sm:table-cell">Commission</TableHead>
                      <TableHead className="text-right hidden md:table-cell">AOV</TableHead>
                      <TableHead className="text-right hidden lg:table-cell">Dern. cmd</TableHead>
                      <TableHead className="hidden sm:table-cell">Agents</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loc.stores.map((s) => (
                      <TableRow key={s.enseigne}>
                        <TableCell className="font-medium">{s.enseigne}</TableCell>
                        <TableCell className="text-right">{formatNumber(s.nbBL)}</TableCell>
                        <TableCell className="text-right font-semibold text-emerald-700 dark:text-emerald-400">
                          {formatEuro(s.caHT)}
                        </TableCell>
                        <TableCell className="text-right hidden sm:table-cell">
                          {formatEuro(s.commission)}
                        </TableCell>
                        <TableCell className="text-right hidden md:table-cell text-slate-600 dark:text-slate-400">
                          {formatEuro(s.aov)}
                        </TableCell>
                        <TableCell className="text-right hidden lg:table-cell text-slate-600 dark:text-slate-400">
                          {s.lastOrder ?? '—'}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <div className="flex gap-1 flex-wrap">
                            {s.agents.map((a) => (
                              <Badge key={a} variant="outline" className="text-xs">
                                {a}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
