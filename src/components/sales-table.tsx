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
import { ArrowUpDown, ArrowUp, ArrowDown, Search, Download } from 'lucide-react';
import { formatEuro, formatNumber } from '@/lib/analyzer';
import type { SalesRow } from '@/lib/types';

interface SalesTableProps {
  rows: SalesRow[];
}

type SortKey = 'agent' | 'date' | 'product' | 'category' | 'quantity' | 'amount';
type SortDir = 'asc' | 'desc';

export function SalesTable({ rows }: SalesTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('amount');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [search, setSearch] = useState('');

  const filteredSortedRows = useMemo(() => {
    const lower = search.trim().toLowerCase();
    const filtered = lower
      ? rows.filter(
          (r) =>
            r.agent.toLowerCase().includes(lower) ||
            r.product.toLowerCase().includes(lower) ||
            (r.category?.toLowerCase().includes(lower) ?? false)
        )
      : rows;

    return [...filtered].sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      if (sortKey === 'quantity' || sortKey === 'amount') {
        const diff = (av as number) - (bv as number);
        return sortDir === 'asc' ? diff : -diff;
      }
      // Pour les dates, tri lexicographique (YYYY-MM-DD)
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
    const headers = ['Agent', 'Date', 'Produit', 'Catégorie', 'Quantité', 'Montant'];
    const lines = filteredSortedRows.map((r) =>
      [
        `"${r.agent.replace(/"/g, '""')}"`,
        r.date ?? '',
        `"${r.product.replace(/"/g, '""')}"`,
        r.category ? `"${r.category.replace(/"/g, '""')}"` : '',
        r.quantity,
        r.amount.toFixed(2),
      ].join(',')
    );
    const csv = [headers.join(','), ...lines].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ventes-analyse.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns: { key: SortKey; label: string; align: 'left' | 'right' }[] = [
    { key: 'agent', label: 'Agent', align: 'left' },
    { key: 'date', label: 'Date', align: 'left' },
    { key: 'product', label: 'Produit', align: 'left' },
    { key: 'category', label: 'Catégorie', align: 'left' },
    { key: 'quantity', label: 'Quantité', align: 'right' },
    { key: 'amount', label: 'Montant', align: 'right' },
  ];

  return (
    <Card className="border-slate-200 dark:border-slate-800">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Détail des ventes</CardTitle>
            <CardDescription>
              {formatNumber(filteredSortedRows.length)} lignes — cliquez sur un en-tête pour trier
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
                {columns.map((col) => (
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
              {filteredSortedRows.slice(0, 500).map((row, idx) => (
                <TableRow key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                  <TableCell className="font-medium">{row.agent}</TableCell>
                  <TableCell className="text-slate-600 dark:text-slate-400">
                    {row.date ?? '—'}
                  </TableCell>
                  <TableCell>{row.product}</TableCell>
                  <TableCell className="text-slate-600 dark:text-slate-400">
                    {row.category ?? '—'}
                  </TableCell>
                  <TableCell className="text-right">{formatNumber(row.quantity)}</TableCell>
                  <TableCell className="text-right font-semibold text-emerald-700 dark:text-emerald-400">
                    {formatEuro(row.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {filteredSortedRows.length > 500 && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 text-center">
            Affichage des 500 premières lignes. Utilisez la recherche pour filtrer ou exportez en CSV pour tout voir.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
