import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { normalizeEnseigne } from '@/lib/normalize-enseigne';

/**
 * GET /api/volumes/clients-analysis
 * GET /api/volumes/clients-analysis?startDate=01/10/2025&endDate=30/09/2026
 * GET /api/volumes/clients-analysis?year=2026&month=10
 *
 * Retourne, par client (enseigne), les 3 KPIs demandés :
 *   - colisCommandes : somme des quantités (VolumeSale.quantity)
 *   - prixVenteMoyen : CA HT / nb pièces (pots) — moyenne pondérée par pot
 *   - referencesProduits : nombre de produits distincts commandés
 *
 * Plus des infos complémentaires utiles : CA HT total, nombre de BL, panier moyen
 * par BL, répartition par parfum/format pour ce client.
 *
 * Source : table VolumeSale (données de volumes importées, sans toucher au CA de
 * la table Sale). Le CA HT est calculé ici comme sum(quantity × unitPrice).
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const yearParam = searchParams.get('year');
    const monthParam = searchParams.get('month');
    const startDateStr = searchParams.get('startDate');
    const endDateStr = searchParams.get('endDate');
    const search = searchParams.get('search')?.trim().toLowerCase() ?? '';

    const where: Record<string, unknown> = {};
    if (yearParam) where.year = parseInt(yearParam, 10);
    if (monthParam) where.month = parseInt(monthParam, 10);

    if (startDateStr && endDateStr) {
      const m1 = startDateStr.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
      const m2 = endDateStr.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
      if (m1 && m2) {
        const start = new Date(parseInt(m1[3]), parseInt(m1[2]) - 1, parseInt(m1[1]));
        const end = new Date(parseInt(m2[3]), parseInt(m2[2]) - 1, parseInt(m2[1]));
        end.setHours(23, 59, 59);
        delete where.year;
        delete where.month;
        where.date = { gte: start, lte: end };
      }
    }

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

    // Regroupe par enseigne (avec déduplication normalisée pour fusionner les
    // variants orthographiques, ex: "COOPERATIVE U ENSIENGE" et "COOPERATIVE U ENSEIGNE")
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

    for (const v of volumes) {
      // Clé normalisée pour fusionner les variants
      const normKey = normalizeEnseigne(v.enseigne) ?? v.enseigne.toUpperCase().trim();
      let agg = byClient.get(normKey);
      if (!agg) {
        agg = {
          enseigne: v.enseigne,
          variants: new Set<string>(),
          colis: 0,
          pots: 0,
          caHT: 0,
          nbBL: new Set<string>(),
          products: new Set<string>(),
          parfums: new Set<string>(),
          formats: new Set<string>(),
          lines: 0,
        };
        byClient.set(normKey, agg);
      }
      agg.variants.add(v.enseigne);
      // Garde le nom le plus court comme représentant canonique (souvent le plus propre)
      if (v.enseigne.length < agg.enseigne.length) agg.enseigne = v.enseigne;

      agg.colis += v.quantity;
      const potsPerColis = v.format ? (FORMAT_POTS[v.format] ?? 1) : 1;
      agg.pots += v.quantity * potsPerColis;
      if (v.unitPrice != null && v.unitPrice > 0) {
        agg.caHT += v.quantity * v.unitPrice;
      }
      if (v.factureRef) agg.nbBL.add(v.factureRef);
      agg.products.add(v.productLabel);
      if (v.parfum) agg.parfums.add(v.parfum);
      if (v.format) agg.formats.add(v.format);
      agg.lines += 1;
    }

    // Construit la liste finale
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

    // Recherche texte sur le nom du client
    if (search) {
      clients = clients.filter((c) =>
        c.enseigne.toLowerCase().includes(search) ||
        c.variants.some((v) => v.toLowerCase().includes(search))
      );
    }

    // Tri par CA HT décroissant par défaut
    clients.sort((a, b) => b.caHT - a.caHT);

    // Totaux globaux
    const totals = {
      nbClients: clients.length,
      totalColis: clients.reduce((s, c) => s + c.colisCommandes, 0),
      totalPots: clients.reduce((s, c) => s + c.potsCommandes, 0),
      totalCA: Math.round(clients.reduce((s, c) => s + c.caHT, 0) * 100) / 100,
      totalBL: clients.reduce((s, c) => s + c.nbBL, 0),
      totalReferences: new Set(clients.flatMap((c) => c.variants)).size,
    };

    // Prix moyen global pondéré par pot
    totals.totalPrixMoyenParPot = totals.totalPots > 0
      ? Math.round((totals.totalCA / totals.totalPots) * 100) / 100
      : 0;

    return NextResponse.json({
      ok: true,
      data: {
        clients,
        totals,
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
