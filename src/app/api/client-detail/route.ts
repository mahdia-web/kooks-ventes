import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isKooksAgent } from '@/lib/dashboard-service';

/**
 * GET /api/client-detail?enseigne=XXX
 * GET /api/client-detail?enseigne=XXX&startDate=01/10/2025&endDate=30/09/2026
 *
 * Retourne une fiche détaillée d'un client (enseigne) :
 *  - Infos générales (type, agent, taux commission, statut)
 *  - KPIs totaux (CA HT total, CA TTC, NB BL, commission, panier moyen)
 *  - KPIs période (CA HT, NB BL, commission) — si une plage de dates est fournie
 *  - Répartition par type (Direct/Centrale)
 *  - Évolution mensuelle (CA par mois, 12 derniers mois)
 *  - Top produits (par quantité)
 *  - Dernières ventes (10 plus récentes)
 *  - Première / dernière commande
 *
 * KOOK'S c'est nous-mêmes : commission et taux toujours à 0.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const enseigneRaw = searchParams.get('enseigne');
    const startDateStr = searchParams.get('startDate');
    const endDateStr = searchParams.get('endDate');

    if (!enseigneRaw) {
      return NextResponse.json({ ok: false, error: 'Paramètre "enseigne" requis' }, { status: 400 });
    }

    // Support des variants séparés par '|' (quand le client a plusieurs écritures)
    const variants = enseigneRaw.split('|').filter(Boolean).map((v) => v.trim());
    if (variants.length === 0) {
      return NextResponse.json({ ok: false, error: 'Enseigne vide' }, { status: 400 });
    }

    // Plage de dates (optionnelle) — DD/MM/YYYY
    let dateRange: { start: Date; end: Date } | null = null;
    if (startDateStr && endDateStr) {
      const m1 = startDateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      const m2 = endDateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (m1 && m2) {
        const start = new Date(parseInt(m1[3]), parseInt(m1[2]) - 1, parseInt(m1[1]));
        const end = new Date(parseInt(m2[3]), parseInt(m2[2]) - 1, parseInt(m2[1]));
        end.setHours(23, 59, 59);
        dateRange = { start, end };
      }
    }

    // Match exact OU normalized pour retrouver la fiche Enseigne
    const enseigneInfo = await db.enseigne.findFirst({
      where: { OR: variants.map((v) => ({ name: v })) },
    });

    // On récupère TOUTES les ventes de ce client (toutes périodes confondues)
    const sales = await db.sale.findMany({
      where: { enseigne: { in: variants } },
      orderBy: { date: 'desc' },
    });

    // Si on n'a pas de ventes avec les variants exacts, on tente une recherche
    // normalized (sans accents, casse insensible) pour récupérer les ventes
    // écrites différemment en base
    let allSales = sales;
    if (sales.length === 0) {
      const normalizeForSearch = (s: string): string =>
        s
          .toUpperCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[''`]/g, '')
          .replace(/\s+/g, ' ')
          .trim();

      const allDbSales = await db.sale.findMany({
        select: {
          id: true,
          blNumber: true,
          date: true,
          enseigne: true,
          type: true,
          agent: true,
          amountHT: true,
          amountTTC: true,
          rate: true,
          commission: true,
          month: true,
          year: true,
        },
        orderBy: { date: 'desc' },
      });

      const normalizedVariants = new Set(variants.map(normalizeForSearch));
      allSales = allDbSales.filter((s) => normalizedVariants.has(normalizeForSearch(s.enseigne)));
    }

    if (allSales.length === 0) {
      return NextResponse.json({
        ok: false,
        error: `Aucune vente trouvée pour "${enseigneRaw}"`,
      }, { status: 404 });
    }

    // Helper: commission effective (KOOK'S = 0)
    const effCommission = (s: { agent: string; commission: number }) =>
      isKooksAgent(s.agent) ? 0 : s.commission;

    // === KPIs globaux (toutes périodes) ===
    const caHTTotal = allSales.reduce((s, r) => s + r.amountHT, 0);
    const caTTCTotal = allSales.reduce((s, r) => s + r.amountTTC, 0);
    const commissionTotal = allSales.reduce((s, r) => s + effCommission(r), 0);
    const nbBl = allSales.length;
    const panierMoyen = nbBl > 0 ? caHTTotal / nbBl : 0;

    // Répartition Direct / Centrale
    const caDirect = allSales.filter((s) => s.type === 'Direct').reduce((s, r) => s + r.amountHT, 0);
    const caCentrale = allSales.filter((s) => s.type === 'Centrale').reduce((s, r) => s + r.amountHT, 0);
    const nbBlDirect = allSales.filter((s) => s.type === 'Direct').length;
    const nbBlCentrale = allSales.filter((s) => s.type === 'Centrale').length;

    // Première / dernière commande (sur toutes les ventes)
    const sortedByDate = [...allSales].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const firstOrder = sortedByDate[0]?.date ?? null;
    const lastOrder = sortedByDate[sortedByDate.length - 1]?.date ?? null;
    const daysSinceLastOrder = lastOrder
      ? Math.floor((Date.now() - new Date(lastOrder).getTime()) / (1000 * 60 * 60 * 24))
      : 9999;

    // Statut (même logique que customerFollowup : >30j = à relancer, >90j = inactif)
    const status: 'OK' | 'A RELANCER' | 'INACTIF' =
      daysSinceLastOrder === 9999 ? 'INACTIF'
      : daysSinceLastOrder > 90 ? 'INACTIF'
      : daysSinceLastOrder > 30 ? 'A RELANCER'
      : 'OK';

    // === KPIs période (si une plage est fournie) ===
    let periodKpis = null;
    if (dateRange) {
      const periodSales = allSales.filter(
        (s) => new Date(s.date) >= dateRange!.start && new Date(s.date) <= dateRange!.end
      );
      periodKpis = {
        caHT: periodSales.reduce((s, r) => s + r.amountHT, 0),
        caTTC: periodSales.reduce((s, r) => s + r.amountTTC, 0),
        commission: periodSales.reduce((s, r) => s + effCommission(r), 0),
        nbBl: periodSales.length,
        caDirect: periodSales.filter((s) => s.type === 'Direct').reduce((s, r) => s + r.amountHT, 0),
        caCentrale: periodSales.filter((s) => s.type === 'Centrale').reduce((s, r) => s + r.amountHT, 0),
        nbBlDirect: periodSales.filter((s) => s.type === 'Direct').length,
        nbBlCentrale: periodSales.filter((s) => s.type === 'Centrale').length,
        startDate: startDateStr,
        endDate: endDateStr,
      };
    }

    // === Évolution mensuelle (12 derniers mois avec données) ===
    const monthMap = new Map<string, { year: number; month: number; caHT: number; nbBl: number; commission: number }>();
    for (const s of allSales) {
      const key = `${s.year}-${String(s.month).padStart(2, '0')}`;
      const existing = monthMap.get(key) ?? { year: s.year, month: s.month, caHT: 0, nbBl: 0, commission: 0 };
      existing.caHT += s.amountHT;
      existing.nbBl += 1;
      existing.commission += effCommission(s);
      monthMap.set(key, existing);
    }
    const monthlyEvolution = Array.from(monthMap.values())
      .sort((a, b) => a.year - b.year || a.month - b.month)
      .slice(-12)
      .map((m) => ({
        ...m,
        label: new Date(m.year, m.month - 1, 1).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
      }));

    // === Top produits (depuis VolumeSale) ===
    const volumeSales = await db.volumeSale.findMany({
      where: { enseigne: { in: variants } },
      select: { productLabel: true, parfum: true, format: true, quantity: true },
    });

    const productMap = new Map<string, { label: string; qty: number }>();
    const parfumMap = new Map<string, number>();
    const formatMap = new Map<string, { qty: number; label: string }>();

    for (const v of volumeSales) {
      if (v.productLabel) {
        const existing = productMap.get(v.productLabel) ?? { label: v.productLabel, qty: 0 };
        existing.qty += v.quantity;
        productMap.set(v.productLabel, existing);
      }
      if (v.parfum) {
        parfumMap.set(v.parfum, (parfumMap.get(v.parfum) ?? 0) + v.quantity);
      }
      if (v.format) {
        const existing = formatMap.get(v.format) ?? { qty: 0, label: v.format };
        existing.qty += v.quantity;
        formatMap.set(v.format, existing);
      }
    }

    const topProducts = Array.from(productMap.values()).sort((a, b) => b.qty - a.qty).slice(0, 10);
    const topParfums = Array.from(parfumMap.entries())
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
    const topFormats = Array.from(formatMap.values()).sort((a, b) => b.qty - a.qty).slice(0, 5);

    // === Dernières ventes (10 plus récentes) — commission KOOK'S forcée à 0 ===
    const recentSales = allSales.slice(0, 10).map((s) => ({
      id: s.id,
      blNumber: s.blNumber,
      date: s.date,
      enseigne: s.enseigne,
      type: s.type,
      agent: s.agent,
      amountHT: s.amountHT,
      amountTTC: s.amountTTC,
      rate: isKooksAgent(s.agent) ? 0 : s.rate,
      commission: effCommission(s),
      month: s.month,
      year: s.year,
    }));

    // === Année par année (résumé annuel) ===
    const yearMap = new Map<number, { year: number; caHT: number; nbBl: number; commission: number }>();
    for (const s of allSales) {
      const existing = yearMap.get(s.year) ?? { year: s.year, caHT: 0, nbBl: 0, commission: 0 };
      existing.caHT += s.amountHT;
      existing.nbBl += 1;
      existing.commission += effCommission(s);
      yearMap.set(s.year, existing);
    }
    const yearlySummary = Array.from(yearMap.values()).sort((a, b) => b.year - a.year);

    // KOOK'S : force commissionRate à 0 même si la base dit autre chose
    const infoName = enseigneInfo?.name ?? variants[0];
    const infoAgent = enseigneInfo?.agent ?? allSales[0]?.agent ?? '';
    const infoType = enseigneInfo?.type ?? allSales[0]?.type ?? 'Direct';
    const infoCommissionRate =
      enseigneInfo && isKooksAgent(infoAgent)
        ? 0
        : enseigneInfo?.commissionRate ?? null;

    return NextResponse.json({
      ok: true,
      data: {
        info: enseigneInfo ? {
          name: infoName,
          type: infoType,
          agent: infoAgent,
          commissionRate: infoCommissionRate,
          isActive: enseigneInfo.isActive,
          oteraLocation: enseigneInfo.oteraLocation,
        } : {
          name: infoName,
          type: infoType,
          agent: infoAgent,
          commissionRate: isKooksAgent(infoAgent) ? 0 : null,
          isActive: true,
          oteraLocation: null,
        },
        kpis: {
          caHTTotal,
          caTTCTotal,
          commissionTotal,
          nbBl,
          panierMoyen,
          caDirect,
          caCentrale,
          nbBlDirect,
          nbBlCentrale,
          firstOrder,
          lastOrder,
          daysSinceLastOrder,
          status,
        },
        periodKpis,
        monthlyEvolution,
        yearlySummary,
        topProducts,
        topParfums,
        topFormats,
        recentSales,
        variantsMatched: Array.from(new Set(allSales.map((s) => s.enseigne))),
      },
    }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 });
  }
}
