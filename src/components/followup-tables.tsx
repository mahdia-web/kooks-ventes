'use client';

import { useState } from 'react';
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
import { formatEuro, formatNumber, formatPercent, formatDate } from '@/lib/dashboard-service';
import type { AgentStat, CustomerFollowup, EnseigneStat } from '@/lib/dashboard-types';
import { Trophy, Medal, Award, Download, Mail, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="font-title">Top enseignes — prix de vente moyen</CardTitle>
        <CardDescription>
          {enseignes.length} enseignes actives sur la période — prix de vente moyen = CA HT / nb BL
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="max-h-96 overflow-y-auto rounded-md border border-border">
          <Table>
            <TableHeader className="sticky top-0 bg-muted z-10">
              <TableRow>
                <TableHead className="w-12 text-center">#</TableHead>
                <TableHead>Enseigne</TableHead>
                <TableHead className="hidden md:table-cell">Type</TableHead>
                <TableHead className="hidden lg:table-cell">Agent</TableHead>
                <TableHead className="text-right">BL</TableHead>
                <TableHead className="text-right">CA HT</TableHead>
                <TableHead className="text-right hidden md:table-cell">Prix moy.</TableHead>
                <TableHead className="text-right">Part</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Dern. cmd</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {enseignes.map((e, idx) => (
                <TableRow key={e.enseigne} className="hover:bg-muted/50">
                  <TableCell className="text-center text-sm text-muted-foreground">
                    {idx + 1}
                  </TableCell>
                  <TableCell className="font-medium">{e.enseigne}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant="outline">{e.type}</Badge>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground">
                    {e.agent}
                  </TableCell>
                  <TableCell className="text-right">{formatNumber(e.nbBl)}</TableCell>
                  <TableCell className="text-right font-semibold text-primary">
                    {formatEuro(e.caHT)}
                  </TableCell>
                  <TableCell className="text-right hidden md:table-cell font-medium">
                    {formatEuro(e.prixVenteMoyen)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary" className="font-mono">
                      {formatPercent(e.share / 100)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right hidden sm:table-cell text-muted-foreground">
                    {formatDate(e.lastOrder)}
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
  availableAgents?: string[];
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

export function CustomerFollowupTable({ customers, availableAgents = [] }: CustomerFollowupTableProps) {
  // Filtre par agent (sélectionnable par l'utilisateur)
  const [agentFilter, setAgentFilter] = useState<string>('all');
  
  const filteredCustomers = agentFilter === 'all' 
    ? customers 
    : customers.filter((c) => c.agent === agentFilter);
  
  const toRelance = filteredCustomers.filter((c) => c.status === 'A RELANCER');
  const inactive = filteredCustomers.filter((c) => c.status === 'INACTIF');
  const ok = filteredCustomers.filter((c) => c.status === 'OK');

  // Tri : À RELANCER d'abord (les plus urgents en haut = jours les + élevés),
  // puis INACTIF (les + anciens), puis OK
  const sortedCustomers = [
    ...toRelance.sort((a, b) => b.daysSinceLastOrder - a.daysSinceLastOrder),
    ...inactive.sort((a, b) => b.daysSinceLastOrder - a.daysSinceLastOrder),
    ...ok.sort((a, b) => b.caTotal - a.caTotal),
  ];

  const exportRelancePdf = async () => {
    // Charge dynamiquement jsPDF + autoTable
    const { jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;
    
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margin = 14;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // En-tête
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('Clients à relancer', margin, 18);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    const dateStr = new Date().toLocaleDateString('fr-FR');
    const filterStr = agentFilter === 'all' ? 'Tous agents' : `Agent : ${agentFilter}`;
    doc.text(`Généré le ${dateStr} • ${filterStr} • ${toRelance.length} client(s) à relancer`, margin, 24);
    
    // Tableau
    autoTable(doc, {
      startY: 30,
      head: [['Enseigne', 'Type', 'Agent', 'Dern. cmd', 'Jours', 'CA Total', 'Récurrence']],
      body: toRelance.map((c) => [
        c.enseigne,
        c.type,
        c.agent,
        formatDate(c.lastOrder),
        c.daysSinceLastOrder === 9999 ? '—' : `${c.daysSinceLastOrder}j`,
        formatEuro(c.caTotal),
        formatPercent(c.recurrence),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [247, 169, 65], textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 8, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 18, halign: 'center' },
        2: { cellWidth: 30 },
        3: { cellWidth: 22, halign: 'right' },
        4: { cellWidth: 14, halign: 'right' },
        5: { cellWidth: 24, halign: 'right' },
        6: { cellWidth: 20, halign: 'right' },
      },
      styles: { overflow: 'linebreak' },
      margin: { left: margin, right: margin },
      didDrawPage: (data: any) => {
        // Numéro de page
        const pageStr = `Page ${doc.getNumberOfPages()}`;
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(pageStr, pageWidth - margin, pageHeight - 8, { align: 'right' });
      },
    });
    
    const filename = agentFilter === 'all' 
      ? 'clients-a-relancer.pdf'
      : `clients-a-relancer-${agentFilter.toLowerCase().replace(/\s+/g, '-')}.pdf`;
    doc.save(filename);
    
    toast.success(`${toRelance.length} clients à relancer exportés en PDF`, {
      description: agentFilter === 'all' ? 'Tous agents' : `Agent : ${agentFilter}`,
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
      c.daysSinceLastOrder === 9999 ? '' : c.daysSinceLastOrder,
      (c.recurrence * 100).toFixed(1) + '%',
      c.status,
    ]);
    downloadCsv(
      'suivi-clients.csv',
      ['Enseigne', 'Type', 'Agent', 'NB BL Total', 'CA Total', 'Dern. cmd', 'Jours écoulés', 'Récurrence', 'Statut'],
      rows
    );
    toast.success(`${customers.length} clients exportés`, {
      description: 'Le fichier CSV a été téléchargé.',
    });
  };

  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="font-title">Suivi clients & relances</CardTitle>
            <CardDescription>
              {customers.length} enseignes • {ok.length} actives • <span className="text-amber-600">{toRelance.length} à relancer</span> • <span className="text-destructive">{inactive.length} inactives</span>
              <span className="ml-2 text-xs text-muted-foreground">— Règle : {'>'} 30 jours = à relancer, {'>'} 90 jours = inactif</span>
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger className="h-8 text-sm w-[180px]">
                <SelectValue placeholder="Tous agents" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les agents</SelectItem>
                {availableAgents.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={exportRelancePdf}
              disabled={toRelance.length === 0}
              className="border-amber-400/50 text-amber-700 hover:bg-amber-50 dark:text-amber-400"
            >
              <FileDown className="h-4 w-4 mr-2" />
              Export PDF à relancer ({toRelance.length})
            </Button>
            <Button variant="outline" size="sm" onClick={exportAll}>
              <Download className="h-4 w-4 mr-2" /> Tout exporter (CSV)
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="max-h-[480px] overflow-y-auto rounded-md border border-border">
          <Table>
            <TableHeader className="sticky top-0 bg-muted z-10">
              <TableRow>
                <TableHead>Enseigne</TableHead>
                <TableHead className="hidden md:table-cell">Type</TableHead>
                <TableHead className="hidden lg:table-cell">Agent</TableHead>
                <TableHead className="text-right">BL</TableHead>
                <TableHead className="text-right">CA Total</TableHead>
                <TableHead className="text-right">Dern. cmd</TableHead>
                <TableHead className="text-right">Jours</TableHead>
                <TableHead className="text-right hidden lg:table-cell">Récurrence</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedCustomers.map((c) => {
                const isUrgent = c.status !== 'OK';
                return (
                  <TableRow
                    key={c.enseigne}
                    className={isUrgent ? 'bg-amber-50/50 dark:bg-amber-950/10 hover:bg-amber-100/50' : 'hover:bg-muted/50'}
                  >
                    <TableCell className="font-medium">{c.enseigne}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant="outline">{c.type}</Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {c.agent}
                    </TableCell>
                    <TableCell className="text-right">{formatNumber(c.nbBlTotal)}</TableCell>
                    <TableCell className="text-right font-semibold text-primary">
                      {formatEuro(c.caTotal)}
                    </TableCell>
                    <TableCell className={`text-right ${isUrgent ? 'font-semibold text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}>
                      {formatDate(c.lastOrder)}
                    </TableCell>
                    <TableCell className={`text-right ${isUrgent ? 'font-semibold text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}>
                      {c.daysSinceLastOrder === 9999 ? '—' : `${c.daysSinceLastOrder}j`}
                    </TableCell>
                    <TableCell className="text-right hidden lg:table-cell text-muted-foreground">
                      {formatPercent(c.recurrence)}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[c.status]}`}>
                        {c.status}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
