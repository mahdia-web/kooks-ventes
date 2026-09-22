'use client';

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  formatEuro,
  formatNumber,
  formatPercent,
  monthLabel,
} from '@/lib/dashboard-service';
import type {
  AgentStat,
  CustomerFollowup,
  DashboardData,
  EnseigneStat,
} from '@/lib/dashboard-types';

interface BilanPdfOptions {
  data: DashboardData;
  agentFilter?: string | null;
  logoDataUrl?: string | null;
}

// Charge le logo depuis /public/logo-kooks.png et le convertit en data URL
async function loadLogo(): Promise<string | null> {
  try {
    const res = await fetch('/logo-kooks.png');
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generateBilanPdf({ data, agentFilter = null }: BilanPdfOptions) {
  const { kpis, customerFollowup, enseignes, agents } = data;
  const periodLabel = monthLabel(kpis.current.month) + ' ' + kpis.current.year;
  const c = kpis.current;

  // Charge le logo
  const logoDataUrl = await loadLogo();

  const isAgentSpecific = !!agentFilter;
  const targetAgent = isAgentSpecific ? agents.find((a) => a.agent === agentFilter) : null;
  // IMPORTANT : on filtre les enseignes et clients à CEUX DE L'AGENT uniquement
  const targetEnseignes = isAgentSpecific
    ? enseignes.filter((e) => e.agent === agentFilter)
    : enseignes;
  const targetCustomers = isAgentSpecific
    ? customerFollowup.filter((cu) => cu.agent === agentFilter)
    : customerFollowup;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - 2 * margin;

  // ============================================================
  // PAGE 1 : Couverture riche (logo + titre + période + KPIs)
  // ============================================================

  // Bande supérieure verticale verte fine
  doc.setFillColor(5, 150, 105);
  doc.rect(0, 0, 6, pageHeight, 'F');

  // Logo centré en haut (si dispo)
  let logoEndY = 30;
  if (logoDataUrl) {
    try {
      // Logo fait 1088x410, ratio ~2.65:1. Largeur cible 70mm
      const logoW = 70;
      const logoH = logoW / 2.65;
      const logoX = (pageWidth - logoW) / 2;
      doc.addImage(logoDataUrl, 'PNG', logoX, 18, logoW, logoH);
      logoEndY = 18 + logoH + 6;
    } catch (e) {
      console.error('Erreur ajout logo:', e);
    }
  }

  // Titre principal
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.text('Bilan Mensuel', pageWidth / 2, logoEndY + 12, { align: 'center' });
  doc.setFontSize(16);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('des Ventes & Commissions', pageWidth / 2, logoEndY + 22, { align: 'center' });

  // Bande période + agent
  let bandeY = logoEndY + 36;
  doc.setFillColor(241, 245, 249); // slate-100
  doc.roundedRect(margin, bandeY, contentWidth, 22, 2, 2, 'F');

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('PÉRIODE', margin + 6, bandeY + 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(periodLabel, margin + 6, bandeY + 16);

  // Agent à droite
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(100, 116, 139);
  doc.text('AGENT', pageWidth - margin - 6, bandeY + 8, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(
    isAgentSpecific && targetAgent ? targetAgent.agent : 'Vue d\'ensemble',
    pageWidth - margin - 6,
    bandeY + 16,
    { align: 'right' }
  );

  // Cartes KPI (4 cartes synthétiques)
  const kpiCardsY = bandeY + 32;
  const cardW = (contentWidth - 9) / 4; // 4 cartes avec 3mm gaps
  const cardH = 28;

  const kpiCards = [
    { label: 'CA HT', value: formatEuro(c.caHT), color: [5, 150, 105] },
    { label: 'Commission', value: formatEuro(c.commission), color: [13, 148, 136] },
    { label: 'Nb BL', value: formatNumber(c.nbBl), color: [8, 145, 178] },
    { label: 'AOV', value: formatEuro(c.aovGlobal), color: [124, 58, 237] },
  ];

  kpiCards.forEach((kpi, idx) => {
    const x = margin + idx * (cardW + 3);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, kpiCardsY, cardW, cardH, 2, 2, 'FD');
    // Barre de couleur en haut
    doc.setFillColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.rect(x, kpiCardsY, cardW, 1.5, 'F');
    // Texte
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'bold');
    doc.text(kpi.label.toUpperCase(), x + cardW / 2, kpiCardsY + 9, { align: 'center' });
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(kpi.value, x + cardW / 2, kpiCardsY + 18, { align: 'center' });
  });

  // Évolution vs mois précédent (si dispo)
  let evolY = kpiCardsY + cardH + 14;
  if (kpis.previous) {
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, evolY, contentWidth, 18, 2, 2, 'F');

    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'bold');
    doc.text(
      `Évolution vs ${kpis.previous.label}` +
      `  •  CA HT: ${formatPercent(kpis.evolution.caHTPercent)}` +
      `  •  Commission: ${formatPercent(kpis.evolution.commissionPercent)}` +
      `  •  BL: ${formatPercent(kpis.evolution.nbBlPercent)}`,
      pageWidth / 2,
      evolY + 11,
      { align: 'center' }
    );
    evolY += 26;
  } else {
    evolY += 8;
  }

  // Répartition Direct/Centrale
  const repartY = evolY;
  const repartH = 36;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, repartY, contentWidth, repartH, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('Répartition Direct / Centrale', margin + 6, repartY + 8);

  // Barre de répartition horizontale
  const barY = repartY + 14;
  const barH = 8;
  const barW = contentWidth - 12;
  const partDirect = c.partCaDirect;
  const partCentrale = c.partCaCentrale;

  doc.setFillColor(5, 150, 105); // Direct = emerald
  doc.rect(margin + 6, barY, barW * partDirect, barH, 'F');
  doc.setFillColor(13, 148, 136); // Centrale = teal
  doc.rect(margin + 6 + barW * partDirect, barY, barW * partCentrale, barH, 'F');

  // Légendes
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Direct: ${formatEuro(c.caDirect)} (${(partDirect * 100).toFixed(1)}%) • ${c.nbBlDirect} BL`,
    margin + 6,
    barY + barH + 6
  );
  doc.text(
    `Centrale: ${formatEuro(c.caCentrale)} (${(partCentrale * 100).toFixed(1)}%) • ${c.nbBlCentrale} BL`,
    pageWidth - margin - 6,
    barY + barH + 6,
    { align: 'right' }
  );

  // Footer page 1
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Édité le ${new Date().toLocaleDateString('fr-FR')} • Kooks • Page 1/${1}`,
    pageWidth / 2,
    pageHeight - 10,
    { align: 'center' }
  );

  // ============================================================
  // PAGE 2+ : Indicateurs clés
  // ============================================================
  doc.addPage();
  let yPos = 18;

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('1. Indicateurs clés du mois', margin, yPos);
  yPos += 6;

  autoTable(doc, {
    startY: yPos,
    head: [['Indicateur', 'Valeur', 'Comparatif vs mois précédent']],
    body: [
      ['Chiffre d\'affaires HT', formatEuro(c.caHT),
        kpis.previous ? `${formatEuro(kpis.previous.caHT)} (${formatPercent(kpis.evolution.caHTPercent)})` : '—'],
      ['Commission', formatEuro(c.commission),
        kpis.previous ? `${formatEuro(kpis.previous.commission)} (${formatPercent(kpis.evolution.commissionPercent)})` : '—'],
      ['Nombre de BL', formatNumber(c.nbBl),
        kpis.previous ? `${formatNumber(kpis.previous.nbBl)} (${formatPercent(kpis.evolution.nbBlPercent)})` : '—'],
      ['Panier moyen (AOV)', formatEuro(c.aovGlobal),
        `Direct: ${formatEuro(c.aovDirect)} / Centrale: ${formatEuro(c.aovCentrale)}`],
      ['BL Direct / Centrale', `${c.nbBlDirect} / ${c.nbBlCentrale}`,
        `CA Direct: ${formatEuro(c.caDirect)} / Centrale: ${formatEuro(c.caCentrale)}`],
      ['Part CA Direct / Centrale',
        `${(c.partCaDirect * 100).toFixed(1)}% / ${(c.partCaCentrale * 100).toFixed(1)}%`, '—'],
      ['Enseignes actives', formatNumber(c.nbEnseignesActives),
        isAgentSpecific ? 'Cet agent' : `${data.global.totalEnseignes} au total`],
    ],
    theme: 'grid',
    headStyles: { fillColor: [5, 150, 105], textColor: 255, fontStyle: 'bold', fontSize: 10 },
    bodyStyles: { textColor: [15, 23, 42], fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 55, fontStyle: 'bold' },
      1: { cellWidth: 40, halign: 'right' },
      2: { cellWidth: 'auto' },
    },
    styles: { cellPadding: 2.5, overflow: 'linebreak' },
    margin: { left: margin, right: margin },
  });

  yPos = (doc as any).lastAutoTable.finalY + 12;

  // ============================================================
  // Top 10 enseignes (filtrées par agent si applicable)
  // ============================================================
  if (yPos > pageHeight - 80) {
    doc.addPage();
    yPos = 18;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `2. Top 10 enseignes ${isAgentSpecific ? `de ${targetAgent?.agent}` : ''}`,
    margin,
    yPos
  );
  yPos += 8;

  const top10 = targetEnseignes.slice(0, 10);

  autoTable(doc, {
    startY: yPos,
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
    headStyles: { fillColor: [13, 148, 136], textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 8, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 12, halign: 'right' },
      4: { cellWidth: 28, halign: 'right' },
      5: { cellWidth: 18, halign: 'right' },
    },
    styles: { overflow: 'linebreak' },
    margin: { left: margin, right: margin },
  });

  // Top 5 Direct + Centrale séparés
  const directTop = targetEnseignes.filter((e) => e.type === 'Direct').slice(0, 5);
  const centraleTop = targetEnseignes.filter((e) => e.type === 'Centrale').slice(0, 5);

  yPos = (doc as any).lastAutoTable.finalY + 8;

  // Top 5 Direct
  if (directTop.length > 0) {
    if (yPos > pageHeight - 60) {
      doc.addPage();
      yPos = 18;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(5, 150, 105);
    doc.text('Top 5 Direct', margin, yPos);
    yPos += 4;
    autoTable(doc, {
      startY: yPos,
      head: [['Enseigne', 'BL', 'CA HT']],
      body: directTop.map((e) => [e.enseigne, String(e.nbBl), formatEuro(e.caHT)]),
      theme: 'striped',
      headStyles: { fillColor: [5, 150, 105], textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 8, cellPadding: 1.8 },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 15, halign: 'right' },
        2: { cellWidth: 30, halign: 'right' },
      },
      styles: { overflow: 'linebreak' },
      margin: { left: margin, right: margin },
    });
    yPos = (doc as any).lastAutoTable.finalY + 6;
  }

  // Top 5 Centrale
  if (centraleTop.length > 0) {
    if (yPos > pageHeight - 60) {
      doc.addPage();
      yPos = 18;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(13, 148, 136);
    doc.text('Top 5 Centrale', margin, yPos);
    yPos += 4;
    autoTable(doc, {
      startY: yPos,
      head: [['Enseigne', 'BL', 'CA HT']],
      body: centraleTop.map((e) => [e.enseigne, String(e.nbBl), formatEuro(e.caHT)]),
      theme: 'striped',
      headStyles: { fillColor: [13, 148, 136], textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 8, cellPadding: 1.8 },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 15, halign: 'right' },
        2: { cellWidth: 30, halign: 'right' },
      },
      styles: { overflow: 'linebreak' },
      margin: { left: margin, right: margin },
    });
  }

  // ============================================================
  // Clients à relancer (filtrés par agent si applicable)
  // ============================================================
  doc.addPage();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `3. Clients à relancer ${isAgentSpecific ? `- ${targetAgent?.agent}` : ''}`,
    margin,
    18
  );

  const toRelance = targetCustomers.filter((cu) => cu.status === 'A RELANCER');
  const inactifs = targetCustomers.filter((cu) => cu.status === 'INACTIF');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `${toRelance.length} à relancer • ${inactifs.length} inactifs sur ${targetCustomers.length} enseignes`,
    margin,
    26
  );

  if (toRelance.length === 0) {
    doc.setFontSize(12);
    doc.setTextColor(5, 150, 105);
    doc.setFont('helvetica', 'bold');
    doc.text('Aucun client à relancer. Excellent travail !', margin, 38);
  } else {
    autoTable(doc, {
      startY: 32,
      head: [['Enseigne', 'Type', 'BL Tot', 'CA Tot', 'Dern. cmd', 'Mois', 'Récurrence']],
      body: toRelance.map((cu) => [
        cu.enseigne,
        cu.type,
        String(cu.nbBlTotal),
        formatEuro(cu.caTotal),
        cu.lastOrder ?? '—',
        String(cu.monthsSinceLastOrder),
        formatPercent(cu.recurrence),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [202, 138, 4], textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 8, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 18 },
        2: { cellWidth: 14, halign: 'right' },
        3: { cellWidth: 24, halign: 'right' },
        4: { cellWidth: 22, halign: 'right' },
        5: { cellWidth: 12, halign: 'right' },
        6: { cellWidth: 22, halign: 'right' },
      },
      styles: { overflow: 'linebreak' },
      margin: { left: margin, right: margin },
    });
  }

  let yPosAfterRelance = (doc as any).lastAutoTable?.finalY ?? 38;
  yPosAfterRelance += 8;

  // Clients inactifs
  if (inactifs.length > 0) {
    if (yPosAfterRelance > pageHeight - 50) {
      doc.addPage();
      yPosAfterRelance = 18;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(220, 38, 38);
    doc.text('Clients inactifs (+3 mois sans commande)', margin, yPosAfterRelance);
    yPosAfterRelance += 4;
    autoTable(doc, {
      startY: yPosAfterRelance,
      head: [['Enseigne', 'Type', 'CA Total', 'Dern. cmd', 'Mois écoulés']],
      body: inactifs.slice(0, 15).map((cu) => [
        cu.enseigne,
        cu.type,
        formatEuro(cu.caTotal),
        cu.lastOrder ?? '—',
        String(cu.monthsSinceLastOrder),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [220, 38, 38], textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 8, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 20 },
        2: { cellWidth: 28, halign: 'right' },
        3: { cellWidth: 22, halign: 'right' },
        4: { cellWidth: 22, halign: 'right' },
      },
      styles: { overflow: 'linebreak' },
      margin: { left: margin, right: margin },
    });
  }

  // ============================================================
  // Performance par agent (seulement en bilan global)
  // ============================================================
  if (!isAgentSpecific && agents.length > 0) {
    doc.addPage();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(15, 23, 42);
    doc.text('4. Performance par agent', margin, 18);

    autoTable(doc, {
      startY: 26,
      head: [['#', 'Agent', 'CA HT', 'Commission', 'BL D/C', 'AOV', 'Part']],
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
      headStyles: { fillColor: [5, 150, 105], textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 9, cellPadding: 2.5 },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 30, halign: 'right' },
        3: { cellWidth: 30, halign: 'right' },
        4: { cellWidth: 20, halign: 'center' },
        5: { cellWidth: 26, halign: 'right' },
        6: { cellWidth: 20, halign: 'right' },
      },
      styles: { overflow: 'linebreak' },
      margin: { left: margin, right: margin },
    });
  }

  // ============================================================
  // Classement complet des enseignes (Direct + Centrale)
  // ============================================================
  doc.addPage();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `5. Classement complet des enseignes ${isAgentSpecific ? `de ${targetAgent?.agent}` : ''}`,
    margin,
    18
  );

  const allDirect = targetEnseignes.filter((e) => e.type === 'Direct').sort((a, b) => b.caHT - a.caHT);
  const allCentrale = targetEnseignes.filter((e) => e.type === 'Centrale').sort((a, b) => b.caHT - a.caHT);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(5, 150, 105);
  doc.text(`Enseignes Direct (${allDirect.length})`, margin, 28);

  autoTable(doc, {
    startY: 31,
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
    headStyles: { fillColor: [5, 150, 105], textColor: 255, fontSize: 8 },
    bodyStyles: { fontSize: 8, cellPadding: 1.8 },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 12, halign: 'right' },
      3: { cellWidth: 26, halign: 'right' },
      4: { cellWidth: 18, halign: 'right' },
      5: { cellWidth: 22, halign: 'right' },
    },
    styles: { overflow: 'linebreak' },
    margin: { left: margin, right: margin },
  });

  let yPosAfterDirect = (doc as any).lastAutoTable.finalY + 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(13, 148, 136);
  doc.text(`Enseignes Centrale (${allCentrale.length})`, margin, yPosAfterDirect);
  yPosAfterDirect += 4;

  autoTable(doc, {
    startY: yPosAfterDirect,
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
    headStyles: { fillColor: [13, 148, 136], textColor: 255, fontSize: 8 },
    bodyStyles: { fontSize: 8, cellPadding: 1.8 },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 12, halign: 'right' },
      3: { cellWidth: 26, halign: 'right' },
      4: { cellWidth: 18, halign: 'right' },
      5: { cellWidth: 22, halign: 'right' },
    },
    styles: { overflow: 'linebreak' },
    margin: { left: margin, right: margin },
  });

  // ============================================================
  // Footer sur toutes les pages
  // ============================================================
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `${periodLabel}${isAgentSpecific ? ` • Agent : ${targetAgent?.agent}` : ' • Bilan global'} • Page ${i}/${pageCount}`,
      pageWidth / 2,
      pageHeight - 6,
      { align: 'center' }
    );
  }

  // Sauvegarde
  const filename = isAgentSpecific
    ? `bilan-${(agentFilter as string).toLowerCase().replace(/\s+/g, '-')}-${kpis.current.year}-${String(kpis.current.month).padStart(2, '0')}.pdf`
    : `bilan-global-${kpis.current.year}-${String(kpis.current.month).padStart(2, '0')}.pdf`;
  doc.save(filename);
}
