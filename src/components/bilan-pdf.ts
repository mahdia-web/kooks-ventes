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

  // === Fetch colis data for the current month ===
  let colisData: Array<{ enseigne: string; totalColis: number; nbLines: number }> = [];
  let totalColis = 0;
  try {
    const colisRes = await fetch(`/api/volumes/colis-summary?year=${kpis.current.year}&month=${kpis.current.month}`, { cache: 'no-store' });
    const colisJson = await colisRes.json();
    if (colisJson.ok) {
      colisData = colisJson.data || [];
      totalColis = colisJson.grandTotal?.colis || 0;
    }
  } catch {
    // Volumes non disponibles — on continue sans
  }

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

  // Adaptation : si l'agent n'a aucune vente Centrale (ex: SEBASTIEN GASNIER),
  // on affiche seulement 4 cartes au lieu de 6 (on skip CA Centrale et BL D/C)
  const hasCentrale = c.caCentrale > 0 || c.nbBlCentrale > 0;
  const kpiCards = hasCentrale
    ? [
        { label: 'CA Total HT', value: pdfEuro(c.caHT), color: kooksOrange },
        { label: 'CA Direct (7%)', value: pdfEuro(c.caDirect), color: kooksCobalt },
        { label: 'CA Centrale (5%)', value: pdfEuro(c.caCentrale), color: kooksOrange },
        { label: 'Commission', value: pdfEuro(c.commission), color: kooksRed },
        { label: 'BL Total', value: pdfNum(c.nbBl), color: kooksCaramel },
        { label: 'BL D / C', value: `${c.nbBlDirect} / ${c.nbBlCentrale}`, color: kooksYellow },
      ]
    : [
        { label: 'CA Total HT', value: pdfEuro(c.caHT), color: kooksOrange },
        { label: 'CA Direct (7%)', value: pdfEuro(c.caDirect), color: kooksCobalt },
        { label: 'Commission', value: pdfEuro(c.commission), color: kooksRed },
        { label: 'BL Total', value: pdfNum(c.nbBl), color: kooksCaramel },
      ];

  // Recalcule la largeur des cartes selon le nombre
  const numCards = kpiCards.length;
  const effectiveCardW = (contentWidth - (numCards - 1) * 3) / numCards;

  kpiCards.forEach((kpi, idx) => {
    const x = margin + idx * (effectiveCardW + 3);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, kpiCardsY, effectiveCardW, cardH, 2, 2, 'FD');
    // Barre de couleur en haut
    doc.setFillColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.rect(x, kpiCardsY, effectiveCardW, 1.5, 'F');
    // Texte
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'bold');
    doc.text(kpi.label.toUpperCase(), x + effectiveCardW / 2, kpiCardsY + 9, { align: 'center' });
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(kpi.value, x + effectiveCardW / 2, kpiCardsY + 18, { align: 'center' });
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

  // Répartition Direct/Centrale — skip si pas de Centrale (agent 100% Direct)
  const repartY = evolY;
  if (hasCentrale) {
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
  } // fin if (hasCentrale)

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
  // PAGE 2+ : Top enseignes + Clients a relancer + Colis + Classement
  // Layout clean : chaque section a assez d'espace, saut de page si besoin
  // ============================================================
  doc.addPage();
  let yPos = 20;

  // --- Section 1: Top 10 enseignes ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text('Top 10 enseignes', margin, yPos);
  yPos += 8;

  const top10 = targetEnseignes.slice(0, 10);

  autoTable(doc, {
    startY: yPos,
    head: [['#', 'Enseigne', 'Type', 'BL', 'CA HT', 'CA M-1', 'Evol.', 'Part']],
    body: top10.map((e, idx) => {
      const prevCa = (e as any).previousMonthCa ?? 0;
      let evolStr = '-';
      if (prevCa > 0) {
        const pct = ((e.caHT - prevCa) / prevCa) * 100;
        const sign = pct >= 0 ? '+' : '';
        evolStr = `${sign}${pct.toFixed(1)}%`;
      } else if (e.caHT > 0) {
        evolStr = 'Nouveau';
      }
      return [
        String(idx + 1),
        e.enseigne,
        e.type,
        String(e.nbBl),
        pdfEuro(e.caHT),
        prevCa > 0 ? pdfEuro(prevCa) : '-',
        evolStr,
        `${e.share.toFixed(1)}%`,
      ];
    }),
    theme: 'striped',
    headStyles: { fillColor: [187, 126, 64], textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 8, cellPadding: 2 },
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
  });

  yPos = (doc as any).lastAutoTable.finalY + 16;

  // --- Section 2: Clients a relancer ---
  if (yPos > pageHeight - 60) {
    doc.addPage();
    yPos = 20;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text('Clients a relancer', margin, yPos);
  yPos += 6;

  const toRelance = targetCustomers.filter((cu) => cu.status === 'A RELANCER');
  const inactifs = targetCustomers.filter((cu) => cu.status === 'INACTIF');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `${toRelance.length} a relancer - ${inactifs.length} inactifs sur ${targetCustomers.length} enseignes`,
    margin,
    yPos
  );
  yPos += 8;

  if (toRelance.length > 0) {
    autoTable(doc, {
      startY: yPos,
      head: [['Enseigne', 'Type', 'BL', 'CA', 'Dern. cmd', 'Mois']],
      body: toRelance.map((cu) => [
        cu.enseigne,
        cu.type,
        String(cu.nbBlTotal),
        pdfEuro(cu.caTotal),
        pdfDate(cu.lastOrder),
        String(cu.monthsSinceLastOrder),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [202, 138, 4], textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 7.5, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 16 },
        2: { cellWidth: 10, halign: 'right' },
        3: { cellWidth: 22, halign: 'right' },
        4: { cellWidth: 20, halign: 'right' },
        5: { cellWidth: 10, halign: 'right' },
      },
      styles: { overflow: 'linebreak' },
      margin: { left: margin, right: margin },
    });
    yPos = (doc as any).lastAutoTable.finalY + 10;
  } else {
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'italic');
    doc.text('Aucun client a relancer ce mois-ci.', margin, yPos);
    yPos += 10;
  }

  // Inactifs
  if (inactifs.length > 0) {
    if (yPos > pageHeight - 50) {
      doc.addPage();
      yPos = 20;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(220, 38, 38);
    doc.text('Clients inactifs (+3 mois)', margin, yPos);
    yPos += 6;
    autoTable(doc, {
      startY: yPos,
      head: [['Enseigne', 'Type', 'CA', 'Dern. cmd', 'Mois']],
      body: inactifs.slice(0, 20).map((cu) => [
        cu.enseigne,
        cu.type,
        pdfEuro(cu.caTotal),
        pdfDate(cu.lastOrder),
        String(cu.monthsSinceLastOrder),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [220, 38, 38], textColor: 255, fontSize: 7.5 },
      bodyStyles: { fontSize: 7.5, cellPadding: 2 },
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
    yPos = (doc as any).lastAutoTable.finalY + 10;
  }

  // --- Section 3: Colis vendus ---
  // Helper: raccourcit le nom d'enseigne pour le tableau colis
  const shortEnseigneName = (name: string): string => {
    let n = name;
    n = n.replace(/SOCIETE COOPERATIVE D'?APPROVISIONNEMENT PARIS.?EST/i, 'SCAPEST');
    n = n.replace(/SOCIETE COOPERATIVE D'?APPROVISIONNEMENT DE L'?OUEST/i, 'SCAOUEST');
    n = n.replace(/SOCIETE COOPERATIVE D'?APPROVISIONNEMENT RHONE.?ALP/i, 'SOCARA');
    n = n.replace(/SOCIETE COOPERATIVE D'?APPROVISIONNEMENT ILE DE FRANCE/i, 'SCADIF');
    n = n.replace(/SOC COOP APPROVISIONNEMENT PARIS NORD/i, 'SCAPNOR');
    n = n.replace(/CENTRA APPROVI CHARENT POITOU/i, 'SCACHAP');
    n = n.replace(/LECLERC APPROVISIONNEMENT SUD/i, 'LECASUD');
    if (n.length > 35) n = n.slice(0, 33) + '..';
    return n;
  };

  // Affiche les colis seulement si l'agent a des enseignes Centrale
  // (BROCARD a des centrales → affiche ; SEBASTIEN n'en a pas → skip)
  const hasCentraleEnseignes = targetEnseignes.some((e) => e.type === 'Centrale');
  if (colisData.length > 0 && (!isAgentSpecific || hasCentraleEnseignes)) {
    if (yPos > pageHeight - 50) {
      doc.addPage();
      yPos = 20;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text(`Colis vendus (${totalColis})`, margin, yPos);
    yPos += 8;

    autoTable(doc, {
      startY: yPos,
      head: [['#', 'Enseigne', 'Colis', '%']],
      body: colisData.slice(0, 20).map((c, idx) => [
        String(idx + 1),
        shortEnseigneName(c.enseigne),
        String(c.totalColis),
        totalColis > 0 ? `${(c.totalColis / totalColis * 100).toFixed(1)}%` : '-',
      ]),
      theme: 'striped',
      headStyles: { fillColor: [54, 116, 181], textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 8, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 7, halign: 'center' },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 20, halign: 'right' },
        3: { cellWidth: 15, halign: 'right' },
      },
      styles: { overflow: 'linebreak' },
      margin: { left: margin, right: margin },
    });
    yPos = (doc as any).lastAutoTable.finalY + 16;
  }

  // --- Section 4: Performance par agent (global only) ---
  if (!isAgentSpecific && agents.length > 0) {
    if (yPos > pageHeight - 60) {
      doc.addPage();
      yPos = 20;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text('Performance par agent', margin, yPos);
    yPos += 8;

    autoTable(doc, {
      startY: yPos,
      head: [['#', 'Agent', 'CA HT', 'Commission', 'BL D/C', 'Part']],
      body: agents.map((a, idx) => [
        String(idx + 1),
        a.agent,
        pdfEuro(a.caHT),
        pdfEuro(a.commission),
        `${a.nbBlDirect}/${a.nbBlCentrale}`,
        `${a.share.toFixed(1)}%`,
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
        5: { cellWidth: 20, halign: 'right' },
      },
      styles: { overflow: 'linebreak' },
      margin: { left: margin, right: margin },
    });
    yPos = (doc as any).lastAutoTable.finalY + 16;
  }

  // --- Section 5: Classement des enseignes ---
  if (yPos > pageHeight - 80) {
    doc.addPage();
    yPos = 20;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text('Classement des enseignes', margin, yPos);
  yPos += 8;

  const allDirect = targetEnseignes.filter((e) => e.type === 'Direct').sort((a, b) => b.caHT - a.caHT);
  const allCentrale = targetEnseignes.filter((e) => e.type === 'Centrale').sort((a, b) => b.caHT - a.caHT);

  // Direct
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(54, 116, 181);
  doc.text(`Direct (${allDirect.length})`, margin, yPos);
  yPos += 4;

  if (allDirect.length > 0) {
    autoTable(doc, {
      startY: yPos,
      head: [['#', 'Enseigne', 'BL', 'CA HT', 'Part', 'Dern. cmd']],
      body: allDirect.map((e, idx) => [
        String(idx + 1),
        e.enseigne,
        String(e.nbBl),
        pdfEuro(e.caHT),
        `${e.share.toFixed(1)}%`,
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
    yPos = (doc as any).lastAutoTable.finalY + 10;
  }

  // Centrale (only if exists)
  if (allCentrale.length > 0) {
    if (yPos > pageHeight - 60) {
      doc.addPage();
      yPos = 20;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(13, 148, 136);
    doc.text(`Centrale (${allCentrale.length})`, margin, yPos);
    yPos += 4;

    autoTable(doc, {
      startY: yPos,
      head: [['#', 'Enseigne', 'BL', 'CA HT', 'Part', 'Dern. cmd']],
      body: allCentrale.map((e, idx) => [
        String(idx + 1),
        e.enseigne,
        String(e.nbBl),
        pdfEuro(e.caHT),
        `${e.share.toFixed(1)}%`,
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
  }

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
