'use client';

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  formatEuro,
  formatNumber,
  formatPercent,
  monthLabel,
} from '@/lib/dashboard-service';
import type { AgentStat, CustomerFollowup, DashboardData, EnseigneStat } from '@/lib/dashboard-types';

interface BilanPdfOptions {
  data: DashboardData;
  agentFilter?: string | null; // si null = bilan global, sinon filtré par agent
}

// Génère un PDF avec :
// - Page de garde (titre, période, agent ou global)
// - KPIs principaux
// - Top 10 enseignes (direct + centrale)
// - Liste des clients à relancer
// - Page récap par agent (si global)
export function generateBilanPdf({ data, agentFilter = null }: BilanPdfOptions) {
  const { kpis, customerFollowup, enseignes, agents } = data;
  const periodLabel = monthLabel(kpis.current.month) + ' ' + kpis.current.year;
  const c = kpis.current;

  // Si un agent est sélectionné, on filtre les données
  const isAgentSpecific = !!agentFilter;
  const targetAgent = isAgentSpecific ? agents.find((a) => a.agent === agentFilter) : null;
  const targetEnseignes = isAgentSpecific
    ? enseignes.filter((e) => e.agent === agentFilter)
    : enseignes;
  const targetCustomers = isAgentSpecific
    ? customerFollowup.filter((cu) => cu.agent === agentFilter)
    : customerFollowup;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - 2 * margin;

  // === Page de garde ===
  doc.setFillColor(5, 150, 105); // emerald-600
  doc.rect(0, 0, pageWidth, 50, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('Bilan Mensuel des Ventes', margin, 22);

  doc.setFontSize(13);
  doc.setFont('helvetica', 'normal');
  doc.text(`Période : ${periodLabel}`, margin, 32);

  if (isAgentSpecific && targetAgent) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`Agent : ${targetAgent.agent}`, margin, 42);
  } else {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Vue d'ensemble - ${agents.length} agent(s) actif(s)`,
      margin,
      42
    );
  }

  // Pied de page de couverture
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(9);
  doc.text(
    `Édité le ${new Date().toLocaleDateString('fr-FR')} • Données consolidées SQLite`,
    margin,
    pageHeight - 10
  );

  // === Page 2 : KPIs principaux ===
  doc.addPage();

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('1. Indicateurs clés du mois', margin, 20);

  // Tableau KPIs
  const kpiRows: (string | number)[][] = [
    ['Chiffre d\'affaires HT', formatEuro(c.caHT), kpis.previous ? `vs ${formatEuro(kpis.previous.caHT)} (${formatPercent(kpis.evolution.caHTPercent)})` : '—'],
    ['Commission', formatEuro(c.commission), kpis.previous ? `vs ${formatEuro(kpis.previous.commission)} (${formatPercent(kpis.evolution.commissionPercent)})` : '—'],
    ['Nombre de BL', formatNumber(c.nbBl), kpis.previous ? `vs ${formatNumber(kpis.previous.nbBl)} (${formatPercent(kpis.evolution.nbBlPercent)})` : '—'],
    ['Panier moyen (AOV)', formatEuro(c.aovGlobal), `Direct: ${formatEuro(c.aovDirect)} • Centrale: ${formatEuro(c.aovCentrale)}`],
    ['BL Direct / Centrale', `${c.nbBlDirect} / ${c.nbBlCentrale}`, `CA Direct: ${formatEuro(c.caDirect)} • CA Centrale: ${formatEuro(c.caCentrale)}`],
    ['Part CA Direct', `${(c.partCaDirect * 100).toFixed(1)}%`, `Part Centrale: ${(c.partCaCentrale * 100).toFixed(1)}%`],
    ['Enseignes actives', formatNumber(c.nbEnseignesActives), isAgentSpecific ? `Cet agent` : `sur ${data.global.totalEnseignes} au total`],
  ];

  autoTable(doc, {
    startY: 28,
    head: [['Indicateur', 'Valeur', 'Comparatif']],
    body: kpiRows,
    theme: 'grid',
    headStyles: { fillColor: [5, 150, 105], textColor: 255, fontStyle: 'bold' },
    bodyStyles: { textColor: [15, 23, 42] },
    columnStyles: {
      0: { cellWidth: 60, fontStyle: 'bold' },
      1: { cellWidth: 45, halign: 'right' },
      2: { cellWidth: 'auto' },
    },
  });

  // === Page 3 : Top enseignes ===
  let yPos = (doc as any).lastAutoTable.finalY + 10;

  if (yPos > pageHeight - 60) {
    doc.addPage();
    yPos = 20;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('2. Top 10 enseignes du mois', margin, yPos);

  const top10 = targetEnseignes.slice(0, 10);
  const directTop = top10.filter((e) => e.type === 'Direct');
  const centraleTop = top10.filter((e) => e.type === 'Centrale');

  autoTable(doc, {
    startY: yPos + 8,
    head: [['#', 'Enseigne', 'Type', 'BL', 'CA HT', 'Part']],
    body: top10.map((e, idx) => [
      String(idx + 1),
      e.enseigne,
      e.type,
      String(e.nbBl),
      formatEuro(e.caHT),
      formatPercent(e.share / 100),
    ]),
    theme: 'striped',
    headStyles: { fillColor: [13, 148, 136], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      3: { cellWidth: 15, halign: 'right' },
      4: { cellWidth: 30, halign: 'right' },
      5: { cellWidth: 20, halign: 'right' },
    },
  });

  yPos = (doc as any).lastAutoTable.finalY + 10;

  if (directTop.length > 0 && yPos < pageHeight - 40) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Top Direct', margin, yPos);
    autoTable(doc, {
      startY: yPos + 5,
      head: [['Enseigne', 'BL', 'CA HT']],
      body: directTop.slice(0, 5).map((e) => [e.enseigne, String(e.nbBl), formatEuro(e.caHT)]),
      theme: 'striped',
      headStyles: { fillColor: [5, 150, 105], textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: {
        1: { cellWidth: 15, halign: 'right' },
        2: { cellWidth: 30, halign: 'right' },
      },
    });
    yPos = (doc as any).lastAutoTable.finalY + 10;
  }

  if (centraleTop.length > 0 && yPos < pageHeight - 40) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Top Centrale', margin, yPos);
    autoTable(doc, {
      startY: yPos + 5,
      head: [['Enseigne', 'BL', 'CA HT']],
      body: centraleTop.slice(0, 5).map((e) => [e.enseigne, String(e.nbBl), formatEuro(e.caHT)]),
      theme: 'striped',
      headStyles: { fillColor: [13, 148, 136], textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: {
        1: { cellWidth: 15, halign: 'right' },
        2: { cellWidth: 30, halign: 'right' },
      },
    });
  }

  // === Page 4 : Clients à relancer ===
  doc.addPage();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text('3. Clients à relancer', margin, 20);

  const toRelance = targetCustomers.filter((c) => c.status === 'A RELANCER');
  const inactifs = targetCustomers.filter((c) => c.status === 'INACTIF');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `${toRelance.length} client(s) à relancer • ${inactifs.length} client(s) inactif(s)`,
    margin,
    28
  );

  if (toRelance.length === 0) {
    doc.setFontSize(12);
    doc.setTextColor(5, 150, 105);
    doc.text('Aucun client à relancer. Excellent travail !', margin, 40);
  } else {
    autoTable(doc, {
      startY: 35,
      head: [['Enseigne', 'Type', 'BL Total', 'CA Total', 'Dern. cmd', 'Mois écoulés', 'Récurrence']],
      body: toRelance.map((c) => [
        c.enseigne,
        c.type,
        String(c.nbBlTotal),
        formatEuro(c.caTotal),
        c.lastOrder ?? '—',
        String(c.monthsSinceLastOrder),
        formatPercent(c.recurrence),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [202, 138, 4], textColor: 255 }, // amber
      bodyStyles: { fontSize: 9 },
      columnStyles: {
        2: { halign: 'right' },
        3: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
      },
    });

    yPos = (doc as any).lastAutoTable.finalY + 10;

    if (inactifs.length > 0 && yPos < pageHeight - 50) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('Clients inactifs (plus de 3 mois)', margin, yPos);
      autoTable(doc, {
        startY: yPos + 5,
        head: [['Enseigne', 'Type', 'CA Total', 'Dern. cmd', 'Mois écoulés']],
        body: inactifs.slice(0, 15).map((c) => [
          c.enseigne,
          c.type,
          formatEuro(c.caTotal),
          c.lastOrder ?? '—',
          String(c.monthsSinceLastOrder),
        ]),
        theme: 'striped',
        headStyles: { fillColor: [220, 38, 38], textColor: 255, fontSize: 9 }, // rose
        bodyStyles: { fontSize: 9 },
        columnStyles: {
          2: { halign: 'right' },
          4: { halign: 'right' },
        },
      });
    }
  }

  // === Page 5 : Performance par agent (si bilan global) ===
  if (!isAgentSpecific && agents.length > 0) {
    doc.addPage();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.text('4. Performance par agent', margin, 20);

    autoTable(doc, {
      startY: 28,
      head: [['#', 'Agent', 'CA HT', 'Commission', 'BL Dir/Cent', 'AOV', 'Part']],
      body: agents.map((a, idx) => [
        String(idx + 1),
        a.agent,
        formatEuro(a.caHT),
        formatEuro(a.commission),
        `${a.nbBlDirect}/${a.nbBlCentrale}`,
        formatEuro(a.aov),
        formatPercent(a.share / 100),
      ]),
      theme: 'grid',
      headStyles: { fillColor: [5, 150, 105], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'center' },
        5: { halign: 'right' },
        6: { halign: 'right' },
      },
    });
  }

  // === Page 6 : Top enseignes par type (classement complet) ===
  if (targetEnseignes.length > 0) {
    doc.addPage();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.text('5. Classement complet des enseignes', margin, 20);

    const allDirect = targetEnseignes.filter((e) => e.type === 'Direct').sort((a, b) => b.caHT - a.caHT);
    const allCentrale = targetEnseignes.filter((e) => e.type === 'Centrale').sort((a, b) => b.caHT - a.caHT);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Enseignes Direct', margin, 30);
    autoTable(doc, {
      startY: 33,
      head: [['#', 'Enseigne', 'BL', 'CA HT', 'Part', 'Dern. cmd']],
      body: allDirect.map((e, idx) => [
        String(idx + 1),
        e.enseigne,
        String(e.nbBl),
        formatEuro(e.caHT),
        formatPercent(e.share / 100),
        e.lastOrder ?? '—',
      ]),
      theme: 'striped',
      headStyles: { fillColor: [5, 150, 105], textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
      },
    });

    yPos = (doc as any).lastAutoTable.finalY + 10;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Enseignes Centrale', margin, yPos);
    autoTable(doc, {
      startY: yPos + 3,
      head: [['#', 'Enseigne', 'BL', 'CA HT', 'Part', 'Dern. cmd']],
      body: allCentrale.map((e, idx) => [
        String(idx + 1),
        e.enseigne,
        String(e.nbBl),
        formatEuro(e.caHT),
        formatPercent(e.share / 100),
        e.lastOrder ?? '—',
      ]),
      theme: 'striped',
      headStyles: { fillColor: [13, 148, 136], textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
      },
    });
  }

  // === Footer sur toutes les pages ===
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `${periodLabel}${isAgentSpecific ? ` • Agent : ${agentFilter}` : ' • Bilan global'} • Page ${i}/${pageCount}`,
      margin,
      pageHeight - 8
    );
  }

  // Sauvegarde
  const filename = isAgentSpecific
    ? `bilan-${agentFilter!.toLowerCase().replace(/\s+/g, '-')}-${kpis.current.year}-${String(kpis.current.month).padStart(2, '0')}.pdf`
    : `bilan-global-${kpis.current.year}-${String(kpis.current.month).padStart(2, '0')}.pdf`;
  doc.save(filename);
}
