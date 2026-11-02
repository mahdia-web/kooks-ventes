'use client';

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  formatEuro,
  formatNumber,
  formatPercent,
  formatDate,
  monthLabel,
} from '@/lib/dashboard-service';
import type {
  AgentStat,
  CustomerFollowup,
  DashboardData,
  EnseigneStat,
} from '@/lib/dashboard-types';

// Fix: jsPDF's default Helvetica font doesn't render non-breaking spaces (U+00A0)
// produced by Intl.NumberFormat. Replace them with regular spaces.
function pdfSafe(text: string): string {
  return text.replace(/\u00A0/g, ' ').replace(/\u202F/g, ' ').replace(/\u2009/g, ' ');
}
function pdfEuro(n: number): string { return pdfSafe(formatEuro(n)); }
function pdfNum(n: number): string { return pdfSafe(formatNumber(n)); }
function pdfPct(n: number): string { return pdfSafe(formatPercent(n)); }
function pdfDate(s: string | null): string { return pdfSafe(formatDate(s)); }

interface BilanPdfOptions {
  data: DashboardData;
  agentFilter?: string | null;
  logoDataUrl?: string | null;
}

// ============================================================
// Mini-graphique d'évolution — dessine un histogramme à barres
// pour la série mensuelle (12 derniers mois) du CA Centrale d'un agent.
// ============================================================
function drawCentraleEvolutionChart(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  series: Array<{ year: number; month: number; caCentrale: number; caDirect: number }>,
  agentName: string,
): number {
  // Filtrer les valeurs nulles (si la série est vide)
  const values = series.map((s) => s.caCentrale);
  const valuesDirect = series.map((s) => s.caDirect);
  if (values.every((v) => v === 0)) {
    // Aucune donnée — affiche juste un message
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.setFont('helvetica', 'italic');
    doc.text(`Aucun CA Centrale pour ${agentName} sur les 12 derniers mois`, x + 2, y + h / 2);
    return h;
  }
  const maxVal = Math.max(...values, ...valuesDirect, 1);
  const barAreaW = w - 4; // 2mm padding chaque côté
  const barAreaH = h - 14; // laisse 14mm pour labels bas + titre
  const n = series.length;
  const barW = barAreaW / n;
  const barUnitH = barAreaH / maxVal;

  // Titre du graphique
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(`Évolution CA Centrale (12 mois) — ${agentName}`, x + 2, y + 4);

  // Axe Y max (label à gauche) — format compact en K€ ou M€
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(100, 116, 139);
  const maxLabel = maxVal >= 1000000
    ? `${(maxVal / 1000000).toFixed(1)}M€`
    : maxVal >= 1000
    ? `${(maxVal / 1000).toFixed(0)}K€`
    : `${maxVal.toFixed(0)}€`;
  doc.text(maxLabel, x, y + 10, { align: 'left' });

  // Dessine chaque barre (CA Centrale en orange, CA Direct en bleu plus fin derrière)
  const chartTop = y + 8;
  for (let i = 0; i < n; i++) {
    const bx = x + 2 + i * barW;
    // Barre Direct (bleu, en fond)
    const dH = valuesDirect[i] * barUnitH;
    if (dH > 0) {
      doc.setFillColor(54, 116, 181); // Kooks cobalt
      doc.rect(bx + 0.5, chartTop + barAreaH - dH, barW * 0.4, dH, 'F');
    }
    // Barre Centrale (orange, devant)
    const cH = values[i] * barUnitH;
    if (cH > 0) {
      doc.setFillColor(247, 169, 65); // Kooks orange
      doc.rect(bx + barW * 0.45, chartTop + barAreaH - cH, barW * 0.45, cH, 'F');
    }
    // Label mois (initiale du mois)
    const monthLabel = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'][series[i].month - 1];
    doc.setFontSize(5.5);
    doc.setTextColor(100, 116, 139);
    doc.text(monthLabel, bx + barW / 2, y + h - 3, { align: 'center' });
  }

  // Légende en haut à droite
  const legY = y + 4;
  const legX = x + w - 50;
  doc.setFillColor(54, 116, 181);
  doc.rect(legX, legY - 1, 2.5, 2, 'F');
  doc.setFontSize(6);
  doc.setTextColor(100, 116, 139);
  doc.text('Direct', legX + 4, legY + 0.5);
  doc.setFillColor(247, 169, 65);
  doc.rect(legX + 18, legY - 1, 2.5, 2, 'F');
  doc.text('Centrale', legX + 22, legY + 0.5);

  // Bordure du graphique
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.rect(x, y, w, h, 'S');

  return h;
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

  const isAgentSpecific = !!agentFilter;
  const targetAgent = isAgentSpecific ? agents.find((a) => a.agent === agentFilter) : null;

  // === KPIs utilisés dans le PDF ===
  // Si agent spécifique : on utilise les stats de l'agent (targetAgent) + son previous
  // Si global : on utilise les KPIs globaux (kpis.current + kpis.previous)
  // C'est CRUCIAL pour que le comparatif vs mois précédent soit correct par agent.
  const c = isAgentSpecific && targetAgent
    ? {
        month: kpis.current.month,
        year: kpis.current.year,
        label: kpis.current.label,
        caHT: targetAgent.caHT,
        caTTC: targetAgent.caTTC,
        commission: targetAgent.commission,
        nbBl: targetAgent.nbBl,
        nbBlDirect: targetAgent.nbBlDirect,
        nbBlCentrale: targetAgent.nbBlCentrale,
        caDirect: targetAgent.caDirect,
        caCentrale: targetAgent.caCentrale,
        aovDirect: targetAgent.nbBlDirect > 0 ? targetAgent.caDirect / targetAgent.nbBlDirect : 0,
        aovCentrale: targetAgent.nbBlCentrale > 0 ? targetAgent.caCentrale / targetAgent.nbBlCentrale : 0,
        aovGlobal: targetAgent.aov,
        partCaDirect: targetAgent.caHT > 0 ? targetAgent.caDirect / targetAgent.caHT : 0,
        partCaCentrale: targetAgent.caHT > 0 ? targetAgent.caCentrale / targetAgent.caHT : 0,
        nbEnseignesActives: targetAgent.enseignesActives,
        enseignesActives: [],
      }
    : kpis.current;

  // Previous : agent-specific si dispo, sinon global
  const previousData = isAgentSpecific
    ? (targetAgent?.previous ?? null)
    : kpis.previous;

  // Evolution : agent-specific si dispo, sinon global
  const evolutionData = isAgentSpecific
    ? (targetAgent?.evolution ?? kpis.evolution)
    : kpis.evolution;

  const periodLabel = monthLabel(c.month) + ' ' + c.year;

  // Charge le logo
  const logoDataUrl = await loadLogo();

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

  // Cartes KPI (6 cartes synthétiques : CA Total, CA Direct, CA Centrale, Commission, BL Total, BL Direct/Centrale)
  const kpiCardsY = bandeY + 32;
  const cardW = (contentWidth - 15) / 6; // 6 cartes avec 5mm gaps (3mm entre)
  const cardH = 28;

  // Palette Kooks — couleurs contrastées Direct vs Centrale
  const kooksOrange: [number, number, number] = [247, 169, 65];   // #f7a941 primaire
  const kooksCobalt: [number, number, number] = [54, 116, 181];   // #3674b5 Direct (bleu)
  const kooksMint: [number, number, number] = [166, 214, 201];     // #a6d6c9 (alternative)
  const kooksRed: [number, number, number] = [227, 6, 19];        // #e30613 commission
  const kooksCaramel: [number, number, number] = [187, 126, 64];   // #bb7e40 (alternative)
  const kooksYellow: [number, number, number] = [255, 225, 17];   // #ffe111 BL D/C

  const kpiCards = [
    { label: 'CA Total HT', value: pdfEuro(c.caHT), color: kooksOrange },
    { label: 'CA Direct (7%)', value: pdfEuro(c.caDirect), color: kooksCobalt },
    { label: 'CA Centrale (5%)', value: pdfEuro(c.caCentrale), color: kooksOrange },
    { label: 'Commission', value: pdfEuro(c.commission), color: kooksRed },
    { label: 'BL Total', value: pdfNum(c.nbBl), color: kooksCaramel },
    { label: 'BL D / C', value: `${c.nbBlDirect} / ${c.nbBlCentrale}`, color: kooksYellow },
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
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'bold');
    doc.text(kpi.label.toUpperCase(), x + cardW / 2, kpiCardsY + 9, { align: 'center' });
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(kpi.value, x + cardW / 2, kpiCardsY + 18, { align: 'center' });
  });

  // Évolution vs mois précédent (si dispo)
  let evolY = kpiCardsY + cardH + 14;
  if (previousData) {
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, evolY, contentWidth, 18, 2, 2, 'F');

    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'bold');
    doc.text(
      `Évolution vs ${previousData.label}` +
      `  •  CA HT: ${pdfPct(evolutionData.caHTPercent)}` +
      `  •  Commission: ${pdfPct(evolutionData.commissionPercent)}` +
      `  •  BL: ${pdfPct(evolutionData.nbBlPercent)}`,
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

  doc.setFillColor(54, 116, 181); // Direct = cobalt Kooks (très distinct de l'orange Centrale)
  doc.rect(margin + 6, barY, barW * partDirect, barH, 'F');
  doc.setFillColor(247, 169, 65); // Centrale = orange Kooks
  doc.rect(margin + 6 + barW * partDirect, barY, barW * partCentrale, barH, 'F');

  // Légendes
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Direct: ${pdfEuro(c.caDirect)} (${(partDirect * 100).toFixed(1)}%) • ${c.nbBlDirect} BL`,
    margin + 6,
    barY + barH + 6
  );
  doc.text(
    `Centrale: ${pdfEuro(c.caCentrale)} (${(partCentrale * 100).toFixed(1)}%) • ${c.nbBlCentrale} BL`,
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
      ['Chiffre d\'affaires HT', pdfEuro(c.caHT),
        previousData ? `${pdfEuro(previousData.caHT)} (${pdfPct(evolutionData.caHTPercent)})` : '—'],
      ['CA Direct (7%)', pdfEuro(c.caDirect),
        previousData ? `${pdfEuro(previousData.caDirect)} (${pdfPct(evolutionData.caDirectPercent)})` : '—'],
      ['CA Centrale (5%)', pdfEuro(c.caCentrale),
        previousData ? `${pdfEuro(previousData.caCentrale)} (${pdfPct(evolutionData.caCentralePercent)})` : '—'],
      ['Commission', pdfEuro(c.commission),
        previousData ? `${pdfEuro(previousData.commission)} (${pdfPct(evolutionData.commissionPercent)})` : '—'],
      ['Nombre de BL', pdfNum(c.nbBl),
        previousData ? `${pdfNum(previousData.nbBl)} (${pdfPct(evolutionData.nbBlPercent)})` : '—'],
      ['Panier moyen (AOV)', pdfEuro(c.aovGlobal),
        `Direct: ${pdfEuro(c.aovDirect)} / Centrale: ${pdfEuro(c.aovCentrale)}`],
      ['BL Direct / Centrale', `${c.nbBlDirect} / ${c.nbBlCentrale}`,
        `CA Direct: ${pdfEuro(c.caDirect)} / Centrale: ${pdfEuro(c.caCentrale)}`],
      ['Part CA Direct / Centrale',
        `${(c.partCaDirect * 100).toFixed(1)}% / ${(c.partCaCentrale * 100).toFixed(1)}%`, '—'],
      ['Enseignes actives', pdfNum(c.nbEnseignesActives),
        isAgentSpecific ? 'Cet agent' : `${pdfNum(data.global.totalEnseignes)} au total`],
    ],
    theme: 'grid',
    headStyles: { fillColor: [247, 169, 65], textColor: 255, fontStyle: 'bold', fontSize: 10 }, // Kooks orange
    bodyStyles: { textColor: [15, 23, 42], fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 48, fontStyle: 'bold' },
      1: { cellWidth: 35, halign: 'right' },
      2: { cellWidth: 'auto' },
    },
    styles: { cellPadding: 2, overflow: 'linebreak', fontSize: 8 },
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
    head: [['#', 'Enseigne', 'Type', 'BL', 'CA HT', 'CA M-1', 'Évol.', 'Part']],
    body: top10.map((e, idx) => {
      const prevCa = (e as any).previousMonthCa ?? 0;
      // Calcul évolution vs mois précédent
      let evolStr = '—';
      if (prevCa > 0) {
        const pct = ((e.caHT - prevCa) / prevCa) * 100;
        const sign = pct >= 0 ? '+' : '';
        evolStr = `${sign}${pct.toFixed(1)}%`;
      } else if (e.caHT > 0) {
        // Pas de CA le mois d'avant = nouveau client ce mois-ci
        evolStr = 'Nouveau';
      }
      return [
        String(idx + 1),
        e.enseigne,
        e.type,
        String(e.nbBl),
        pdfEuro(e.caHT),
        prevCa > 0 ? pdfEuro(prevCa) : '—',
        evolStr,
        pdfPct(e.share / 100),
      ];
    }),
    theme: 'striped',
    headStyles: { fillColor: [187, 126, 64], textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 7.5, cellPadding: 1.8 },
    columnStyles: {
      0: { cellWidth: 7, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 14, halign: 'center' },
      3: { cellWidth: 9, halign: 'right' },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 22, halign: 'right' },
      6: { cellWidth: 18, halign: 'right' },
      7: { cellWidth: 14, halign: 'right' },
    },
    styles: { overflow: 'linebreak' },
    margin: { left: margin, right: margin },
    didParseCell: (data) => {
      // Colorise la colonne évolution (index 6) en vert/rouge
      if (data.section === 'body' && data.column.index === 6) {
        const txt = String(data.cell.text[0] ?? '');
        if (txt.startsWith('+')) {
          data.cell.styles.textColor = [5, 150, 105]; // vert
          data.cell.styles.fontStyle = 'bold';
        } else if (txt.startsWith('-')) {
          data.cell.styles.textColor = [220, 38, 38]; // rouge
          data.cell.styles.fontStyle = 'bold';
        } else if (txt === 'Nouveau') {
          data.cell.styles.textColor = [54, 116, 181]; // bleu
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  yPos = (doc as any).lastAutoTable.finalY + 14;

  // ============================================================
  // Clients à relancer (filtrés par agent si applicable)
  // — ne force pas un addPage si on a encore de la place
  // ============================================================
  if (yPos > pageHeight - 80) {
    doc.addPage();
    yPos = 18;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `3. Clients à relancer ${isAgentSpecific ? `- ${targetAgent?.agent}` : ''}`,
    margin,
    yPos
  );
  yPos += 7;

  const toRelance = targetCustomers.filter((cu) => cu.status === 'A RELANCER');
  const inactifs = targetCustomers.filter((cu) => cu.status === 'INACTIF');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `${toRelance.length} à relancer • ${inactifs.length} inactifs sur ${targetCustomers.length} enseignes`,
    margin,
    yPos
  );
  yPos += 6;

  if (toRelance.length === 0) {
    doc.setFontSize(12);
    doc.setTextColor(5, 150, 105);
    doc.setFont('helvetica', 'bold');
    doc.text('Aucun client à relancer. Excellent travail !', margin, yPos);
  } else {
    autoTable(doc, {
      startY: yPos + 8,
      head: [['Enseigne', 'Type', 'BL Tot', 'CA Tot', 'Dern. cmd', 'Mois', 'Récurrence']],
      body: toRelance.map((cu) => [
        cu.enseigne,
        cu.type,
        String(cu.nbBlTotal),
        pdfEuro(cu.caTotal),
        pdfDate(cu.lastOrder),
        String(cu.monthsSinceLastOrder),
        pdfPct(cu.recurrence),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [202, 138, 4], textColor: 255, fontSize: 7.5 },
      bodyStyles: { fontSize: 7.5, cellPadding: 1.8 },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 16 },
        2: { cellWidth: 12, halign: 'right' },
        3: { cellWidth: 22, halign: 'right' },
        4: { cellWidth: 20, halign: 'right' },
        5: { cellWidth: 10, halign: 'right' },
        6: { cellWidth: 20, halign: 'right' },
      },
      styles: { overflow: 'linebreak' },
      margin: { left: margin, right: margin },
    });
  }

  let yPosAfterRelance = (doc as any).lastAutoTable?.finalY ?? (yPos + 10);
  yPosAfterRelance += 10;

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
      body: inactifs.slice(0, 20).map((cu) => [
        cu.enseigne,
        cu.type,
        pdfEuro(cu.caTotal),
        pdfDate(cu.lastOrder),
        String(cu.monthsSinceLastOrder),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [220, 38, 38], textColor: 255, fontSize: 7.5 },
      bodyStyles: { fontSize: 7.5, cellPadding: 1.8 },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 18 },
        2: { cellWidth: 26, halign: 'right' },
        3: { cellWidth: 20, halign: 'right' },
        4: { cellWidth: 20, halign: 'right' },
      },
      styles: { overflow: 'linebreak' },
      margin: { left: margin, right: margin },
    });
  }

  // ============================================================
  // Performance par agent (seulement en bilan global)
  // ============================================================
  // yPosAfterAgentTable est déclaré ici pour pouvoir être réutilisé
  // après le bloc if (pour le classement complet des enseignes)
  let yPosAfterAgentTable = yPosAfterRelance;
  if (!isAgentSpecific && agents.length > 0) {
    yPosAfterRelance = (doc as any).lastAutoTable?.finalY ?? yPosAfterRelance;
    yPosAfterRelance += 14;
    if (yPosAfterRelance > pageHeight - 60) {
      doc.addPage();
      yPosAfterRelance = 18;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(15, 23, 42);
    doc.text('4. Performance par agent', margin, yPosAfterRelance);

    autoTable(doc, {
      startY: yPosAfterRelance + 6,
      head: [['#', 'Agent', 'CA HT', 'Commission', 'BL D/C', 'AOV', 'Part']],
      body: agents.map((a, idx) => [
        String(idx + 1),
        a.agent,
        pdfEuro(a.caHT),
        pdfEuro(a.commission),
        `${a.nbBlDirect}/${a.nbBlCentrale}`,
        pdfEuro(a.aov),
        pdfPct(a.share / 100),
      ]),
      theme: 'grid',
      headStyles: { fillColor: [247, 169, 65], textColor: 255, fontSize: 9 },
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

    // === Graphiques d'évolution CA Centrale par agent ===
    // Chaque agent a son propre mini-graphique montrant l'évolution mensuelle
    // sur les 12 derniers mois du CA Centrale (orange) et CA Direct (bleu).
    yPosAfterAgentTable = (doc as any).lastAutoTable?.finalY ?? yPosAfterRelance;
    yPosAfterAgentTable += 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('Évolution du CA Centrale par agent (12 derniers mois)', margin, yPosAfterAgentTable);
    yPosAfterAgentTable += 6;

    // Pour chaque agent : dessine un mini-graphique de 38mm de haut
    // 2 graphiques par ligne (largeur moitié de la page chacun)
    const chartW = (contentWidth - 4) / 2; // 2 colonnes avec 4mm gap
    const chartH = 38;
    const agentsWithCentrale = agents.filter((a) =>
      (a as any).centraleMonthlySeries &&
      ((a as any).centraleMonthlySeries as any[]).some((s) => s.caCentrale > 0 || s.caDirect > 0)
    );

    let currentRow = 0;
    let currentCol = 0;
    for (let i = 0; i < agentsWithCentrale.length; i++) {
      const a = agentsWithCentrale[i];
      // Calcul position sur la page courante
      const chartX = margin + currentCol * (chartW + 4);
      const chartY = yPosAfterAgentTable + currentRow * (chartH + 4);

      // Si le graphique déborde en bas → nouvelle page
      if (chartY + chartH > pageHeight - 14) {
        doc.addPage();
        yPosAfterAgentTable = 20;
        currentRow = 0;
        currentCol = 0;
      }

      const finalX = margin + currentCol * (chartW + 4);
      const finalY = yPosAfterAgentTable + currentRow * (chartH + 4);
      drawCentraleEvolutionChart(doc, finalX, finalY, chartW, chartH, (a as any).centraleMonthlySeries, a.agent);

      // Avance la position : colonne suivante, ou ligne suivante
      currentCol++;
      if (currentCol >= 2) {
        currentCol = 0;
        currentRow++;
      }
    }
    // Met à jour yPosAfterAgentTable pour la suite (pour le classement complet)
    const totalRowsUsed = currentRow + (currentCol > 0 ? 1 : 0);
    yPosAfterAgentTable = yPosAfterAgentTable + totalRowsUsed * (chartH + 4);

    // Si aucun agent n'a de données Centrale, avance quand même le curseur
    if (agentsWithCentrale.length === 0) {
      yPosAfterAgentTable += 10;
    }
  }

  // ============================================================
  // Classement complet des enseignes (Direct + Centrale)
  // — ne force pas un addPage si on a encore de la place
  // ============================================================
  // Si on vient de dessiner les graphiques d'évolution par agent,
  // yPosAfterAgentTable contient la position finale. Sinon, on retombe
  // sur yPosAfterRelance (cas bilan spécifique à un agent).
  let yPosAfterAgent = yPosAfterAgentTable > yPosAfterRelance + 14
    ? yPosAfterAgentTable
    : ((doc as any).lastAutoTable?.finalY ?? yPosAfterRelance);
  yPosAfterAgent += 14;
  if (yPosAfterAgent > pageHeight - 80) {
    doc.addPage();
    yPosAfterAgent = 18;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `${isAgentSpecific ? '' : '5. '}Classement complet des enseignes ${isAgentSpecific ? `de ${targetAgent?.agent}` : ''}`,
    margin,
    yPosAfterAgent
  );

  const allDirect = targetEnseignes.filter((e) => e.type === 'Direct').sort((a, b) => b.caHT - a.caHT);
  const allCentrale = targetEnseignes.filter((e) => e.type === 'Centrale').sort((a, b) => b.caHT - a.caHT);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(54, 116, 181);
  doc.text(`Enseignes Direct (${allDirect.length})`, margin, yPosAfterAgent + 8);

  autoTable(doc, {
    startY: yPosAfterAgent + 11,
    head: [['#', 'Enseigne', 'BL', 'CA HT', 'Part', 'Dern. cmd']],
    body: allDirect.map((e, idx) => [
      String(idx + 1),
      e.enseigne,
      String(e.nbBl),
      pdfEuro(e.caHT),
      pdfPct(e.share / 100),
      pdfDate(e.lastOrder),
    ]),
    theme: 'striped',
    headStyles: { fillColor: [54, 116, 181], textColor: 255, fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5, cellPadding: 1.5 },
    columnStyles: {
      0: { cellWidth: 7, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 10, halign: 'right' },
      3: { cellWidth: 24, halign: 'right' },
      4: { cellWidth: 16, halign: 'right' },
      5: { cellWidth: 20, halign: 'right' },
    },
    styles: { overflow: 'linebreak' },
    margin: { left: margin, right: margin },
  });

  let yPosAfterDirect = (doc as any).lastAutoTable.finalY + 10;
  if (yPosAfterDirect > pageHeight - 60) {
    doc.addPage();
    yPosAfterDirect = 18;
  }

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
      pdfEuro(e.caHT),
      pdfPct(e.share / 100),
      pdfDate(e.lastOrder),
    ]),
    theme: 'striped',
    headStyles: { fillColor: [247, 169, 65], textColor: 255, fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5, cellPadding: 1.5 },
    columnStyles: {
      0: { cellWidth: 7, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 10, halign: 'right' },
      3: { cellWidth: 24, halign: 'right' },
      4: { cellWidth: 16, halign: 'right' },
      5: { cellWidth: 20, halign: 'right' },
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
    ? `bilan-${(agentFilter as string).toLowerCase().replace(/\s+/g, '-')}-${c.year}-${String(c.month).padStart(2, '0')}.pdf`
    : `bilan-global-${c.year}-${String(c.month).padStart(2, '0')}.pdf`;
  doc.save(filename);
}
