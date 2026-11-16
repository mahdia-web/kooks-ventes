import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { normalizeEnseigne } from '@/lib/normalize-enseigne';

/**
 * GET /api/volumes/clients-analysis
 * GET /api/volumes/clients-analysis?year=2026&month=10
 * GET /api/volumes/clients-analysis?startDate=01/10/2025&endDate=30/09/2026
 *
 * Retourne, par client (enseigne), les KPIs demandés :
 *   - colisCommandes : somme des quantités (VolumeSale.quantity)
 *   - prixVenteMoyenParPot / parColis : CA HT / pots (ou colis) — moyenne pondérée
 *   - referencesProduits : nombre de produits distincts commandés
 *   - prixVenteUnitaireParProduit : prix de vente moyen par combinaison produit × format
 *
 * Plus des KPIs globaux :
 *   - colisMoyenParMois : moyenne mensuelle des colis (total colis / nb mois distincts)
 *   - prixMoyenParProduitFormat : prix de vente moyen par produit × format (top lignes)
 *
 * Comparaison vs période précédente :
 *   - Si la période filtrée est un mois (year+month) → comparaison vs le mois précédent
 *   - Si la période est une plage startDate/endDate → comparaison vs la plage
 *     de même durée juste avant
 *   - previousPeriod = { caHT, colis, nbBL, prixMoyenParPot, colisMoyenParMois }
 *   - evolutions = { caHTPercent, colisPercent, nbBLPercent, prixMoyenParPotPercent }
 *
 * NOTE sur la répartition Direct/Centrale :
 *   - La répartition Direct/Centrale ne concerne QUE les agents (voir dashboard).
 *   - Un client individuel n'a pas de répartition direct/centrale : il est soit
 *     Direct, soit Centrale, pas les deux. Cette route ne renvoie donc PAS de
 *     champs direct/centrale par client.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const yearParam = searchParams.get('year');
    const monthParam = searchParams.get('month');
    const startDateStr = searchParams.get('startDate');
    const endDateStr = searchParams.get('endDate');
    const search = searchParams.get('search')?.trim().toLowerCase() ?? '';
    const comparePrev = searchParams.get('comparePrev') !== 'false'; // default true

    // === Construit le filtre de la période courante ===
    const where: Record<string, unknown> = {};
    let currentPeriod: { year?: number; month?: number; start?: Date; end?: Date } = {};

    if (startDateStr && endDateStr) {
      const m1 = startDateStr.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
      const m2 = endDateStr.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
      if (m1 && m2) {
        const start = new Date(parseInt(m1[3]), parseInt(m1[2]) - 1, parseInt(m1[1]));
        const end = new Date(parseInt(m2[3]), parseInt(m2[2]) - 1, parseInt(m2[1]));
        end.setHours(23, 59, 59);
        where.date = { gte: start, lte: end };
        currentPeriod = { start, end };
      }
    } else if (yearParam) {
      where.year = parseInt(yearParam, 10);
      if (monthParam) {
        where.month = parseInt(monthParam, 10);
        currentPeriod = { year: parseInt(yearParam, 10), month: parseInt(monthParam, 10) };
      } else {
        currentPeriod = { year: parseInt(yearParam, 10) };
      }
    }

    // === Charge les volumes de la période courante ===
    const volumes = await db.volumeSale.findMany({
      where,
      select: {
        enseigne: true,
        productLabel: true,
        parfum: true,
        format: true,
        quantity: true,
        unitPrice: true,
        date: true,
        factureRef: true,
      },
      orderBy: { date: 'asc' },
    });

    // Pots par format (pour convertir colis → pots)
    const FORMAT_POTS: Record<string, number> = {
      'Lot de 2': 12,
      'Indiv Fouro': 8,
      'Indiv PAV 8': 8,
      'Box de 9': 36,
    };

    // === Agrège par client ===
    interface ClientAgg {
      enseigne: string;
      variants: Set<string>;
      colis: number;
      pots: number;
      caHT: number;
      nbBL: Set<string>;
      products: Set<string>;
      parfums: Set<string>;
      formats: Set<string>;
      lines: number;
    }
    const byClient = new Map<string, ClientAgg>();

    // === Agrège par produit × format (pour prix moyen par produit×format) ===
    interface ProductFormatAgg {
      productLabel: string;
      parfum: string | null;
      format: string | null;
      colis: number;
      pots: number;
      caHT: number;
      lines: number;
    }
    const byProductFormat = new Map<string, ProductFormatAgg>();

    // === Agrège par mois (pour colis moyen par mois) ===
    const byMonth = new Map<string, { year: number; month: number; colis: number; caHT: number }>();

    for (const v of volumes) {
      // --- Par client ---
      const normKey = normalizeEnseigne(v.enseigne) ?? v.enseigne.toUpperCase().trim();
      let agg = byClient.get(normKey);
      if (!agg) {
        agg = {
          enseigne: v.enseigne,
          variants: new Set<string>(),
          colis: 0, pots: 0, caHT: 0,
          nbBL: new Set<string>(),
          products: new Set<string>(),
          parfums: new Set<string>(),
          formats: new Set<string>(),
          lines: 0,
        };
        byClient.set(normKey, agg);
      }
      agg.variants.add(v.enseigne);
      if (v.enseigne.length < agg.enseigne.length) agg.enseigne = v.enseigne;

      const potsPerColis = v.format ? (FORMAT_POTS[v.format] ?? 1) : 1;
      const lineCA = (v.unitPrice != null && v.unitPrice > 0) ? v.quantity * v.unitPrice : 0;

      agg.colis += v.quantity;
      agg.pots += v.quantity * potsPerColis;
      agg.caHT += lineCA;
      if (v.factureRef) agg.nbBL.add(v.factureRef);
      agg.products.add(v.productLabel);
      if (v.parfum) agg.parfums.add(v.parfum);
      if (v.format) agg.formats.add(v.format);
      agg.lines += 1;

      // --- Par produit × format ---
      const pfKey = `${v.productLabel}|${v.format ?? 'null'}`;
      let pf = byProductFormat.get(pfKey);
      if (!pf) {
        pf = {
          productLabel: v.productLabel,
          parfum: v.parfum,
          format: v.format,
          colis: 0, pots: 0, caHT: 0, lines: 0,
        };
        byProductFormat.set(pfKey, pf);
      }
      pf.colis += v.quantity;
      pf.pots += v.quantity * potsPerColis;
      pf.caHT += lineCA;
      pf.lines += 1;

      // --- Par mois ---
      const monthKey = `${v.year}-${v.month}`;
      let m = byMonth.get(monthKey);
      if (!m) {
        m = { year: v.year, month: v.month, colis: 0, caHT: 0 };
        byMonth.set(monthKey, m);
      }
      m.colis += v.quantity;
      m.caHT += lineCA;
    }

    // === Construit la liste des clients ===
    let clients = Array.from(byClient.values()).map((agg) => {
      const prixMoyenParPot = agg.pots > 0 ? agg.caHT / agg.pots : 0;
      const prixMoyenParColis = agg.colis > 0 ? agg.caHT / agg.colis : 0;
      const panierMoyenBL = agg.nbBL.size > 0 ? agg.caHT / agg.nbBL.size : 0;
      return {
        enseigne: agg.enseigne,
        variants: Array.from(agg.variants),
        colisCommandes: agg.colis,
        potsCommandes: agg.pots,
        caHT: Math.round(agg.caHT * 100) / 100,
        prixVenteMoyenParPot: Math.round(prixMoyenParPot * 100) / 100,
        prixVenteMoyenParColis: Math.round(prixMoyenParColis * 100) / 100,
        nbBL: agg.nbBL.size,
        panierMoyenBL: Math.round(panierMoyenBL * 100) / 100,
        referencesProduits: agg.products.size,
        nbParfums: agg.parfums.size,
        nbFormats: agg.formats.size,
        lignes: agg.lines,
      };
    });

    if (search) {
      clients = clients.filter((c) =>
        c.enseigne.toLowerCase().includes(search) ||
        c.variants.some((v) => v.toLowerCase().includes(search))
      );
    }
    clients.sort((a, b) => b.caHT - a.caHT);

    // === Prix moyen par produit × format (top 30) ===
    const prixParProduitFormat = Array.from(byProductFormat.values())
      .map((pf) => ({
        productLabel: pf.productLabel,
        parfum: pf.parfum,
        format: pf.format,
        colis: pf.colis,
        pots: pf.pots,
        caHT: Math.round(pf.caHT * 100) / 100,
        prixMoyenParPot: pf.pots > 0 ? Math.round((pf.caHT / pf.pots) * 100) / 100 : 0,
        prixMoyenParColis: pf.colis > 0 ? Math.round((pf.caHT / pf.colis) * 100) / 100 : 0,
        lignes: pf.lines,
      }))
      .sort((a, b) => b.caHT - a.caHT)
      .slice(0, 30);

    // === Colis moyen par mois ===
    const monthlySeries = Array.from(byMonth.values())
      .sort((a, b) => (a.year - b.year) || (a.month - b.month))
      .map((m) => ({
        ...m,
        label: `${String(m.month).padStart(2, '0')}/${m.year}`,
        caHT: Math.round(m.caHT * 100) / 100,
      }));
    const nbMonths = byMonth.size;
    const totalColis = clients.reduce((s, c) => s + c.colisCommandes, 0);
    const totalCA = Math.round(clients.reduce((s, c) => s + c.caHT, 0) * 100) / 100;
    const totalPots = clients.reduce((s, c) => s + c.potsCommandes, 0);
    const totalBL = clients.reduce((s, c) => s + c.nbBL, 0);
    const colisMoyenParMois = nbMonths > 0 ? Math.round(totalColis / nbMonths) : 0;
    const caMoyenParMois = nbMonths > 0 ? Math.round((totalCA / nbMonths) * 100) / 100 : 0;
    const prixMoyenGlobalParPot = totalPots > 0 ? Math.round((totalCA / totalPots) * 100) / 100 : 0;

    // === Totaux globaux ===
    const totals = {
      nbClients: clients.length,
      totalColis,
      totalPots,
      totalCA,
      totalBL,
      colisMoyenParMois,
      caMoyenParMois,
      nbMois: nbMonths,
      prixMoyenGlobalParPot,
    };

    // === Comparaison vs période précédente ===
    let previousPeriod: { caHT: number; colis: number; nbBL: number; prixMoyenParPot: number; colisMoyenParMois: number; nbMois: number } | null = null;
    let evolutions: { caHTPercent: number; colisPercent: number; nbBLPercent: number; prixMoyenParPotPercent: number; colisMoyenParMoisPercent: number } | null = null;

    if (comparePrev) {
      const prevWhere = await buildPreviousPeriodWhere(currentPeriod);
      if (prevWhere) {
        const prevVolumes = await db.volumeSale.findMany({
          where: prevWhere,
          select: { quantity: true, unitPrice: true, format: true, date: true, factureRef: true, year: true, month: true },
        });
        let prevCA = 0, prevColis = 0, prevPots = 0;
        const prevBL = new Set<string>();
        const prevMonths = new Set<string>();
        for (const v of prevVolumes) {
          const potsPerColis = v.format ? (FORMAT_POTS[v.format] ?? 1) : 1;
          prevColis += v.quantity;
          prevPots += v.quantity * potsPerColis;
          if (v.unitPrice != null && v.unitPrice > 0) prevCA += v.quantity * v.unitPrice;
          if (v.factureRef) prevBL.add(v.factureRef);
          prevMonths.add(`${v.year}-${v.month}`);
        }
        const prevNbMonths = prevMonths.size;
        const prevPrixMoyenParPot = prevPots > 0 ? prevCA / prevPots : 0;
        const prevColisMoyenParMois = prevNbMonths > 0 ? prevColis / prevNbMonths : 0;
        previousPeriod = {
          caHT: Math.round(prevCA * 100) / 100,
          colis: prevColis,
          nbBL: prevBL.size,
          prixMoyenParPot: Math.round(prevPrixMoyenParPot * 100) / 100,
          colisMoyenParMois: Math.round(prevColisMoyenParMois),
          nbMois: prevNbMonths,
        };
        const safeDiv = (cur: number, prev: number) => prev > 0 ? ((cur - prev) / prev) * 100 : (cur > 0 ? 100 : 0);
        evolutions = {
          caHTPercent: Math.round(safeDiv(totalCA, prevCA) * 10) / 10,
          colisPercent: Math.round(safeDiv(totalColis, prevColis) * 10) / 10,
          nbBLPercent: Math.round(safeDiv(totalBL, prevBL.size) * 10) / 10,
          prixMoyenParPotPercent: Math.round(safeDiv(prixMoyenGlobalParPot, prevPrixMoyenParPot) * 10) / 10,
          colisMoyenParMoisPercent: Math.round(safeDiv(colisMoyenParMois, prevColisMoyenParMois) * 10) / 10,
        };
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        clients,
        totals,
        prixParProduitFormat,
        monthlySeries,
        previousPeriod,
        evolutions,
        filteredPeriod: {
          year: yearParam ? parseInt(yearParam, 10) : null,
          month: monthParam ? parseInt(monthParam, 10) : null,
          startDate: startDateStr ?? null,
          endDate: endDateStr ?? null,
        },
      },
    });
  } catch (e) {
    console.error('[volumes/clients-analysis] Error:', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur serveur' },
      { status: 500 }
    );
  }
}

/**
 * Construit le filtre WHERE pour la période précédente, correspondant à la
 * même durée que la période courante mais juste avant.
 *
 * - Si currentPeriod = {year, month} → previous = mois précédent (gère jan→déc N-1)
 * - Si currentPeriod = {year} (année complète) → previous = année précédente
 * - Si currentPeriod = {start, end} (plage) → previous = plage de même durée juste avant
 */
async function buildPreviousPeriodWhere(
  current: { year?: number; month?: number; start?: Date; end?: Date }
): Promise<Record<string, unknown> | null> {
  if (current.start && current.end) {
    const durationMs = current.end.getTime() - current.start.getTime();
    const prevEnd = new Date(current.start.getTime() - 1); // jour juste avant start
    const prevStart = new Date(prevEnd.getTime() - durationMs);
    return { date: { gte: prevStart, lte: prevEnd } };
  }
  if (current.year && current.month) {
    // Mois précédent
    let y = current.year;
    let m = current.month - 1;
    if (m < 1) { m = 12; y -= 1; }
    return { year: y, month: m };
  }
  if (current.year && !current.month) {
    // Année précédente complète
    return { year: current.year - 1 };
  }
  return null;
}
