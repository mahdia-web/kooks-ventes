'use client';

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatEuro, formatNumber, formatDate, monthLabel } from '@/lib/dashboard-service';
import type { DashboardData } from '@/lib/dashboard-types';

function pdfSafe(text: string): string {
  return text.replace(/\u00A0/g, ' ').replace(/\u202F/g, ' ').replace(/\u2009/g, ' ');
}
function pdfEuro(n: number): string { return pdfSafe(formatEuro(n)); }
function pdfNum(n: number): string { return pdfSafe(formatNumber(n)); }
function pdfDate(s: string | null): string { return pdfSafe(formatDate(s)); }

interface ClientsPdfOptions {
  data: DashboardData;
  agentFilter?: string | null;
}

/**
 * Génère un PDF contenant uniquement les clients à relancer et inactifs.
 * Filtre par agent si spécifié.
 */
export async function generateClientsPdf({ data, agentFilter = null }: ClientsPdfOptions) {
  const isAgentSpecific = !!agentFilter;
  const targetCustomers = isAgentSpecific
    ? data.customerFollowup.filter((cu) => cu.agent === agentFilter)
    : data.customerFollowup;

  const toRelance = targetCustomers.filter((cu) => cu.status === 'A RELANCER');
  const inactifs = targetCustomers.filter((cu) => cu.status === 'INACTIF');
  const actifs = targetCustomers.filter((cu) => cu.status === 'OK');

  const periodLabel = monthLabel(data.kpis.current.month) + ' ' + data.kpis.current.year;
  const agentLabel = isAgentSpecific ? agentFilter : 'Vue d\'ensemble';

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - 2 * margin;

  // ============================================================
  // HEADER
  // ============================================================
  doc.setFillColor(5, 150, 105);
  doc.rect(0, 0, 6, pageHeight, 'F');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('Clients à relancer et inactifs', margin, 22);

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(`${agentLabel} — ${periodLabel}`, margin, 30);

  // Bande summary
  let y = 38;
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(margin, y, contentWidth, 16, 2, 2, 'F');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  const totalRelance = toRelance.length + inactifs.length;
  doc.text(
    `${totalRelance} client(s) à relancer  •  ${actifs.length} actif(s)  •  ${targetCustomers.length} enseigne(s) au total`,
    pageWidth / 2,
    y + 10,
    { align: 'center' }
  );
  y += 24;

  // ============================================================
  // CLIENTS À RELANCER
  // ============================================================
  if (y > pageHeight - 40) {
    doc.addPage();
    y = 20;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(202, 138, 4);
  // Fusionne à relancer + inactifs en une seule liste (tout va de paire)
  const allToRelance = [...toRelance, ...inactifs];

  doc.text(`Clients à relancer et inactifs (${allToRelance.length})`, margin, y);
  y += 4;

  if (allToRelance.length === 0) {
    y += 6;
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'italic');
    doc.text('Aucun client à relancer.', margin, y);
    y += 8;
  } else {
    autoTable(doc, {
      startY: y + 2,
      head: [['Enseigne', 'Type', 'BL', 'CA Total', 'Dern. cmd', 'Mois', 'Statut']],
      body: allToRelance.map((cu) => [
        cu.enseigne,
        cu.type,
        String(cu.nbBlTotal),
        pdfEuro(cu.caTotal),
        pdfDate(cu.lastOrder),
        String(cu.monthsSinceLastOrder),
        cu.status,
      ]),
      theme: 'striped',
      headStyles: { fillColor: [202, 138, 4], textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 7.5, cellPadding: 1.8 },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 16 },
        2: { cellWidth: 10, halign: 'right' },
        3: { cellWidth: 24, halign: 'right' },
        4: { cellWidth: 22, halign: 'right' },
        5: { cellWidth: 12, halign: 'right' },
        6: { cellWidth: 22 },
      },
      styles: { overflow: 'linebreak' },
      margin: { left: margin, right: margin },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 6) {
          data.cell.styles.textColor = [202, 138, 4];
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 14;
  }

  // (La section inactifs est fusionnée avec la section à relancer ci-dessus
  //  — tout va de paire, pas de commentaire, juste la liste)

  // ============================================================
  // Footer
  // ============================================================
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `${periodLabel} • ${agentLabel} • Page ${i}/${pageCount}`,
      pageWidth / 2,
      pageHeight - 6,
      { align: 'center' }
    );
  }

  const filename = `clients-a-relancer-${(agentFilter ?? 'tous').toLowerCase().replace(/\s+/g, '-')}-${data.kpis.current.year}-${String(data.kpis.current.month).padStart(2, '0')}.pdf`;
  doc.save(filename);
}
