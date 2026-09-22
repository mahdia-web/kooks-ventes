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
import { Button } from '@/components/ui/button';
import { formatEuro, formatNumber, formatPercent } from '@/lib/dashboard-service';
import type { AgentStat, CustomerFollowup, EnseigneStat } from '@/lib/dashboard-types';
import { Trophy, Medal, Award, Download, Mail } from 'lucide-react';
import { toast } from 'sonner';

const RANK_ICONS = [
  <Trophy key="0" className="h-4 w-4 text-amber-500" />,
  <Medal key="1" className="h-4 w-4 text-slate-400" />,
  <Award key="2" className="h-4 w-4 text-orange-400" />,
];

interface AgentTableProps {
  agents: AgentStat[];
}

export function AgentTable({ agents }: AgentTableProps) {
  if (agents.length === 0) {
    return (
      <Card className="border-slate-200 dark:border-slate-800">
        <CardHeader><CardTitle>Classement des agents</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">Aucune vente pour ce mois.</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="border-slate-200 dark:border-slate-800">
      <CardHeader>
        <CardTitle>Classement des agents</CardTitle>
        <CardDescription>Performance par commercial sur la période</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="max-h-96 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-800">
          <Table>
            <TableHeader className="sticky top-0 bg-slate-50 dark:bg-slate-900 z-10">
              <TableRow>
                <TableHead className="w-12 text-center">#</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead className="text-right">CA HT</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Commission</TableHead>
                <TableHead className="text-right hidden md:table-cell">BL Dir/Cent</TableHead>
                <TableHead className="text-right hidden md:table-cell">AOV</TableHead>
                <TableHead className="text-right hidden lg:table-cell">Enseignes</TableHead>
                <TableHead className="text-right">Part</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.map((a, idx) => (
                <TableRow key={a.agent} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                  <TableCell className="text-center">
                    <div className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800">
                      {RANK_ICONS[idx] ?? <span className="text-xs text-slate-600">{idx + 1}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{a.agent}</TableCell>
                  <TableCell className="text-right font-semibold text-emerald-700 dark:text-emerald-400">
                    {formatEuro(a.caHT)}
                  </TableCell>
                  <TableCell className="text-right hidden sm:table-cell">
                    {formatEuro(a.commission)}
                  </TableCell>
                  <TableCell className="text-right hidden md:table-cell text-slate-600 dark:text-slate-400">
                    {a.nbBlDirect} / {a.nbBlCentrale}
                  </TableCell>
                  <TableCell className="text-right hidden md:table-cell text-slate-600 dark:text-slate-400">
                    {formatEuro(a.aov)}
                  </TableCell>
                  <TableCell className="text-right hidden lg:table-cell text-slate-600 dark:text-slate-400">
                    {a.enseignesActives}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary" className="font-mono">
                      {formatPercent(a.share / 100)}
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

interface EnseigneTableProps {
  enseignes: EnseigneStat[];
}

export function EnseigneTable({ enseignes }: EnseigneTableProps) {
  return (
    <Card className="border-slate-200 dark:border-slate-800">
      <CardHeader>
        <CardTitle>Top enseignes</CardTitle>
        <CardDescription>
          {enseignes.length} enseignes actives sur la période
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="max-h-96 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-800">
          <Table>
            <TableHeader className="sticky top-0 bg-slate-50 dark:bg-slate-900 z-10">
              <TableRow>
                <TableHead className="w-12 text-center">#</TableHead>
                <TableHead>Enseigne</TableHead>
                <TableHead className="hidden md:table-cell">Type</TableHead>
                <TableHead className="hidden lg:table-cell">Agent</TableHead>
                <TableHead className="text-right">BL</TableHead>
                <TableHead className="text-right">CA HT</TableHead>
                <TableHead className="text-right">Part</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Dern. cmd</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {enseignes.map((e, idx) => (
                <TableRow key={e.enseigne} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                  <TableCell className="text-center text-sm text-slate-500">
                    {idx + 1}
                  </TableCell>
                  <TableCell className="font-medium">{e.enseigne}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge
                      variant="outline"
                      className={
                        e.type === 'Direct'
                          ? 'border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400'
                          : 'border-teal-300 text-teal-700 dark:border-teal-800 dark:text-teal-400'
                      }
                    >
                      {e.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-slate-600 dark:text-slate-400">
                    {e.agent}
                  </TableCell>
                  <TableCell className="text-right">{formatNumber(e.nbBl)}</TableCell>
                  <TableCell className="text-right font-semibold text-emerald-700 dark:text-emerald-400">
                    {formatEuro(e.caHT)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary" className="font-mono">
                      {formatPercent(e.share / 100)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right hidden sm:table-cell text-slate-600 dark:text-slate-400">
                    {e.lastOrder ?? '—'}
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

const STATUS_STYLES: Record<CustomerFollowup['status'], string> = {
  'OK': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
  'A RELANCER': 'bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  'INACTIF': 'bg-rose-100 text-rose-800 dark:bg-rose-950/30 dark:text-rose-400 border-rose-200 dark:border-rose-800',
};

interface CustomerFollowupTableProps {
  customers: CustomerFollowup[];
}

function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      r
        .map((cell) => {
          const s = String(cell);
          if (s.includes(',') || s.includes('"') || s.includes('\n')) {
            return `"${s.replace(/"/g, '""')}"`;
          }
          return s;
        })
        .join(',')
    ),
  ];
  const csv = '\uFEFF' + lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function CustomerFollowupTable({ customers }: CustomerFollowupTableProps) {
  const toRelance = customers.filter((c) => c.status === 'A RELANCER');
  const inactive = customers.filter((c) => c.status === 'INACTIF');
  const ok = customers.filter((c) => c.status === 'OK');

  const exportRelance = () => {
    const rows = toRelance.map((c) => [
      c.enseigne,
      c.type,
      c.agent,
      c.nbBlTotal,
      c.caTotal.toFixed(2),
      c.lastOrder ?? '',
      c.monthsSinceLastOrder === 999 ? '' : c.monthsSinceLastOrder,
      (c.recurrence * 100).toFixed(1) + '%',
    ]);
    downloadCsv(
      'clients-a-relancer.csv',
      ['Enseigne', 'Type', 'Agent', 'NB BL Total', 'CA Total', 'Dern. cmd', 'Mois écoulés', 'Récurrence'],
      rows
    );
    toast.success(`${toRelance.length} clients à relancer exportés`, {
      description: 'Le fichier CSV a été téléchargé.',
    });
  };

  const exportAll = () => {
    const rows = customers.map((c) => [
      c.enseigne,
      c.type,
      c.agent,
      c.nbBlTotal,
      c.caTotal.toFixed(2),
      c.lastOrder ?? '',
      c.monthsSinceLastOrder === 999 ? '' : c.monthsSinceLastOrder,
      (c.recurrence * 100).toFixed(1) + '%',
      c.status,
    ]);
    downloadCsv(
      'suivi-clients.csv',
      ['Enseigne', 'Type', 'Agent', 'NB BL Total', 'CA Total', 'Dern. cmd', 'Mois écoulés', 'Récurrence', 'Statut'],
      rows
    );
    toast.success(`${customers.length} clients exportés`, {
      description: 'Le fichier CSV a été téléchargé.',
    });
  };

  return (
    <Card className="border-slate-200 dark:border-slate-800">
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle>Suivi fidélisation clients</CardTitle>
            <CardDescription>
              {customers.length} enseignes au total • {ok.length} actives • {toRelance.length} à relancer • {inactive.length} inactives
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={exportRelance}
              disabled={toRelance.length === 0}
              className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/30"
            >
              <Mail className="h-4 w-4 mr-2" />
              Exporter à relancer ({toRelance.length})
            </Button>
            <Button variant="outline" size="sm" onClick={exportAll}>
              <Download className="h-4 w-4 mr-2" /> Tout exporter
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="max-h-[480px] overflow-y-auto rounded-md border border-slate-200 dark:border-slate-800">
          <Table>
            <TableHeader className="sticky top-0 bg-slate-50 dark:bg-slate-900 z-10">
              <TableRow>
                <TableHead>Enseigne</TableHead>
                <TableHead className="hidden md:table-cell">Type</TableHead>
                <TableHead className="hidden lg:table-cell">Agent</TableHead>
                <TableHead className="text-right">BL</TableHead>
                <TableHead className="text-right">CA Total</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Dern. cmd</TableHead>
                <TableHead className="text-right hidden md:table-cell">Mois écoulés</TableHead>
                <TableHead className="text-right hidden lg:table-cell">Récurrence</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c) => (
                <TableRow key={c.enseigne} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                  <TableCell className="font-medium">{c.enseigne}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant="outline">{c.type}</Badge>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-slate-600 dark:text-slate-400">
                    {c.agent}
                  </TableCell>
                  <TableCell className="text-right">{formatNumber(c.nbBlTotal)}</TableCell>
                  <TableCell className="text-right font-semibold text-emerald-700 dark:text-emerald-400">
                    {formatEuro(c.caTotal)}
                  </TableCell>
                  <TableCell className="text-right hidden sm:table-cell text-slate-600 dark:text-slate-400">
                    {c.lastOrder ?? '—'}
                  </TableCell>
                  <TableCell className="text-right hidden md:table-cell text-slate-600 dark:text-slate-400">
                    {c.monthsSinceLastOrder === 999 ? '—' : c.monthsSinceLastOrder}
                  </TableCell>
                  <TableCell className="text-right hidden lg:table-cell text-slate-600 dark:text-slate-400">
                    {formatPercent(c.recurrence)}
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[c.status]}`}>
                      {c.status}
                    </span>
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
