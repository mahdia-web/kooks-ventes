'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatEuro, formatNumber, formatPercent } from '@/lib/analyzer';
import type { AgentStat } from '@/lib/types';
import { Trophy, Medal, Award } from 'lucide-react';

interface AgentRankingProps {
  agents: AgentStat[];
}

const RANK_ICONS = [
  <Trophy key="0" className="h-4 w-4 text-amber-500" />,
  <Medal key="1" className="h-4 w-4 text-slate-400" />,
  <Award key="2" className="h-4 w-4 text-orange-400" />,
];

export function AgentRanking({ agents }: AgentRankingProps) {
  return (
    <Card className="border-slate-200 dark:border-slate-800">
      <CardHeader>
        <CardTitle>Classement des agents</CardTitle>
        <CardDescription>Performance par commercial</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="max-h-96 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-800">
          <Table>
            <TableHeader className="sticky top-0 bg-slate-50 dark:bg-slate-900">
              <TableRow>
                <TableHead className="w-12 text-center">#</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead className="text-right">CA</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Ventes</TableHead>
                <TableHead className="text-right hidden md:table-cell">Panier moyen</TableHead>
                <TableHead className="text-right">Part</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.map((agent, idx) => (
                <TableRow key={agent.agent} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                  <TableCell className="text-center font-bold">
                    <div className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800">
                      {RANK_ICONS[idx] ?? <span className="text-xs text-slate-600">{idx + 1}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{agent.agent}</TableCell>
                  <TableCell className="text-right font-semibold text-primary dark:text-primary">
                    {formatEuro(agent.totalAmount)}
                  </TableCell>
                  <TableCell className="text-right hidden sm:table-cell">
                    {formatNumber(agent.salesCount)}
                  </TableCell>
                  <TableCell className="text-right hidden md:table-cell text-slate-600 dark:text-slate-400">
                    {formatEuro(agent.averageSale)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary" className="font-mono">
                      {formatPercent(agent.share)}
                    </Badge>
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
