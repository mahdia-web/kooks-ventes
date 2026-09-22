'use client';

import { useMemo, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Search,
  Download,
} from 'lucide-react';
import { formatEuro, formatNumber } from '@/lib/dashboard-service';
import type { SaleRow } from '@/lib/dashboard-types';

interface SalesDetailTableProps {
  rows: SaleRow[];
}

type SortKey = 'date' | 'blNumber' | 'enseigne' | 'type' | 'agent' | 'amountHT' | 'commission';
type SortDir = 'asc' | 'desc';

const COLUMNS: { key: SortKey; label: string; align: 'left' | 'right' }[] = [
  { key: 'date', label: 'Date', align: 'left' },
  { key: 'blNumber', label: 'N° BL', align: 'left' },
  { key: 'enseigne', label: 'Enseigne', align: 'left' },
  { key: 'type', label: 'Type', align: 'left' },
  { key: 'agent', label: 'Agent', align: 'left' },
  { key: 'amountHT', label: 'MT HT', align: 'right' },
  { key: 'commission', label: 'Commission', align: 'right' },
];

export function SalesDetailTable({ rows }: SalesDetailTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [search, setSearch] = useState('');

  const filteredSortedRows = useMemo(() => {
    const lower = search.trim().toLowerCase();
    const filtered = lower
      ? rows.filter(
          (r) =>
            r.blNumber.toLowerCase().includes(lower) ||
            r.enseigne.toLowerCase().includes(lower) ||
            r.agent.toLowerCase().includes(lower) ||
            r.type.toLowerCase().includes(lower)
        )
      : rows;

    return [...filtered].sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      if (sortKey === 'amountHT' || sortKey === 'commission') {
        const diff = (av as number) - (bv as number);
        return sortDir === 'asc' ? diff : -diff;
      }
      const cmp = String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDir, search]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (column !== sortKey) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === 'asc' ? (
      <ArrowUp className="h-3 w-3 text-emerald-600" />
    ) : (
      <ArrowDown className="h-3 w-3 text-emerald-600" />
    );
  };

  const exportCsv = () => {
    const headers = ['Date', 'N° BL', 'Enseigne', 'Type', 'Agent', 'MT HT', 'MT TTC', 'Taux', 'Commission'];
    const lines = filteredSortedRows.map((r) =>
      [
        r.date,
        `"${r.blNumber}"`,
        `"${r.enseigne.replace(/"/g, '""')}"`,
        r.type,
        `"${r.agent.replace(/"/g, '""')}"`,
        r.amountHT.toFixed(2),
        r.amountTTC.toFixed(2),
        r.rate.toFixed(4),
        r.commission.toFixed(2),
      ].join(',')
    );
    const csv = [headers.join(','), ...lines].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ventes-${rows[0]?.year ?? 'x'}-${rows[0]?.month ?? 'x'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="border-slate-200 dark:border-slate-800">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Détail des ventes du mois</CardTitle>
            <CardDescription>
              {formatNumber(filteredSortedRows.length)} ventes affichées — cliquez sur un en-tête pour trier
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher..."
                className="pl-8 w-full sm:w-56"
              />
            </div>
            <Button variant="outline" size="icon" onClick={exportCsv} title="Exporter en CSV">
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="max-h-[480px] overflow-auto rounded-md border border-slate-200 dark:border-slate-800">
          <Table>
            <TableHeader className="sticky top-0 bg-slate-50 dark:bg-slate-900 z-10">
              <TableRow>
                {COLUMNS.map((col) => (
                  <TableHead
                    key={col.key}
                    className={col.align === 'right' ? 'text-right' : ''}
                  >
                    <button
                      onClick={() => toggleSort(col.key)}
                      className="inline-flex items-center gap-1 hover:text-emerald-700 dark:hover:text-emerald-400 font-medium"
                    >
                      {col.label}
                      <SortIcon column={col.key} />
                    </button>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSortedRows.slice(0, 500).map((row) => (
                <TableRow key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                  <TableCell className="text-slate-600 dark:text-slate-400">
                    {row.date}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.blNumber}</TableCell>
                  <TableCell className="font-medium">{row.enseigne}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        row.type === 'Direct'
                          ? 'border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400'
                          : 'border-teal-300 text-teal-700 dark:border-teal-800 dark:text-teal-400'
                      }
                    >
                      {row.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-slate-600 dark:text-slate-400">
                    {row.agent}
                  </TableCell>
                  <TableCell className="text-right font-semibold text-emerald-700 dark:text-emerald-400">
                    {formatEuro(row.amountHT)}
                  </TableCell>
                  <TableCell className="text-right text-slate-600 dark:text-slate-400">
                    {formatEuro(row.commission)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {filteredSortedRows.length > 500 && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 text-center">
            Affichage des 500 premières lignes. Affinez la recherche ou exportez en CSV pour tout voir.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
