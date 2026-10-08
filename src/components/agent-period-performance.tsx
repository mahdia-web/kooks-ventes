'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trophy, Medal, Award, Users } from 'lucide-react';
import { formatEuro, formatNumber, formatPercent, formatDate } from '@/lib/dashboard-service';
import type { AgentPeriodTotal } from '@/lib/dashboard-types';

const RANK_ICONS = [
  <Trophy key="0" className="h-4 w-4 text-amber-500" />,
  <Medal key="1" className="h-4 w-4 text-slate-400" />,
  <Award key="2" className="h-4 w-4 text-orange-400" />,
];

interface Props {
  agents: AgentPeriodTotal[];
}

/**
 * Affiche les performances globales de chaque agent sur TOUTE la période disponible
 * (pas seulement le mois sélectionné). Permet de comparer les commerciaux entre eux.
 */
export function AgentPeriodPerformance({ agents }: Props) {
  if (agents.length === 0) {
    return (
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="font-title flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Performances des commerciaux — Période totale
          </CardTitle>
          <CardDescription>Aucune vente sur la période</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="font-title flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          Performances des commerciaux — Période totale
        </CardTitle>
        <CardDescription>
          Lecture globale des CA, commissions et volumes BL de chaque commercial
          sur toute la période disponible
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="max-h-96 overflow-y-auto rounded-md border border-border">
          <Table>
            <TableHeader className="sticky top-0 bg-muted z-10">
              <TableRow>
                <TableHead className="w-12 text-center">#</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead className="text-right">CA HT total</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Commission</TableHead>
                <TableHead className="text-right hidden md:table-cell">BL Total</TableHead>
                <TableHead className="text-right hidden md:table-cell">CA Direct / Centrale</TableHead>
                <TableHead className="text-right hidden lg:table-cell">Enseignes</TableHead>
                <TableHead className="text-right hidden md:table-cell">Colis</TableHead>
                <TableHead className="text-right hidden lg:table-cell">Pots</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Part %</TableHead>
                <TableHead className="text-right hidden lg:table-cell">1ère cmd</TableHead>
                <TableHead className="text-right">Dern. cmd</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.map((a, idx) => (
                <TableRow key={a.agent} className="hover:bg-muted/50">
                  <TableCell className="text-center">
                    <div className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-muted">
                      {RANK_ICONS[idx] ?? <span className="text-xs text-muted-foreground">{idx + 1}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{a.agent}</TableCell>
                  <TableCell className="text-right font-semibold text-primary">
                    {formatEuro(a.caHT)}
                  </TableCell>
                  <TableCell className="text-right hidden sm:table-cell">
                    {formatEuro(a.commission)}
                  </TableCell>
                  <TableCell className="text-right hidden md:table-cell">
                    {formatNumber(a.nbBl)}
                  </TableCell>
                  <TableCell className="text-right hidden md:table-cell">
                    <span className="text-[#3674b5]">{formatEuro(a.caDirect)}</span>
                    <span className="text-muted-foreground mx-1">/</span>
                    <span className="text-primary">{formatEuro(a.caCentrale)}</span>
                  </TableCell>
                  <TableCell className="text-right hidden lg:table-cell text-muted-foreground">
                    {formatNumber(a.enseignesActives)}
                  </TableCell>
                  <TableCell className="text-right hidden md:table-cell">
                    {formatNumber(a.totalColis ?? 0)}
                  </TableCell>
                  <TableCell className="text-right hidden lg:table-cell">
                    {formatNumber(a.totalPots ?? 0)}
                  </TableCell>
                  <TableCell className="text-right hidden sm:table-cell">
                    {a.share.toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-right hidden lg:table-cell text-muted-foreground text-xs">
                    {formatDate(a.firstOrder)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground text-xs">
                    {formatDate(a.lastOrder)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
