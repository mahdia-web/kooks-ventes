import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const maxDuration = 60;

/**
 * GET /api/products/marge-estimee
 *
 * Calcule la marge estimée par pot pour chaque référence (parfum × format),
 * en incluant une part des charges directes (TTC) allouée au prorata du CA.
 *
 * Query params:
 *   includeTransport=true   (toujours true, ignoré)
 *   includeMarketing=true|false  (default true)
 *   includeCatalogues=true|false (default false)
 *   includeImprimes=true|false   (default false)
 *   startDate=JJ/MM/AAAA    (default: 1er janvier année en cours)
 *   endDate=JJ/MM/AAAA      (default: 31 décembre année en cours)
 *
 * Réponse:
 *   { ok, products: [{ productId, name, parfum, format, caProduct, nbPots,
 *                      prixVenteMoyenParPot, achatParPot, margeBruteParPot,
 *                      chargesParPot, margeNetteParPot, margePct }],
 *     totals: { chargesDirectesTTC, chargesParCategorie, totalCAProduits,
 *               totalPots } }
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const includeMarketing = searchParams.get('includeMarketing') !== 'false';
    const includeCatalogues = searchParams.get('includeCatalogues') === 'true';
    const includeImprimes = searchParams.get('includeImprimes') === 'true';

    const startDateStr = searchParams.get('startDate');
    const endDateStr = searchParams.get('endDate');
    let start: Date, end: Date;
    if (startDateStr && endDateStr) {
      const m1 = startDateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      const m2 = endDateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (!m1 || !m2) {
        return NextResponse.json({ ok: false, error: 'Format date invalide (JJ/MM/AAAA)' }, { status: 400 });
      }
      start = new Date(parseInt(m1[3]), parseInt(m1[2]) - 1, parseInt(m1[1]));
      end = new Date(parseInt(m2[3]), parseInt(m2[2]) - 1, parseInt(m2[1]));
    } else {
      const now = new Date();
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear(), 11, 31);
    }
    end.setHours(23, 59, 59);

    // 1. Produits avec prix d'achat + format
    const products = await db.product.findMany({
      where: { isActive: true, parfumId: { not: null }, formatId: { not: null } },
      include: {
        parfum: true,
        format: true,
        purchasePrices: { where: { endDate: null }, take: 1 },
      },
    });

    // 2. VolumeSale (CA par parfum×format) sur la période
    const volumeSales = await db.volumeSale.findMany({
      where: { date: { gte: start, lte: end } },
      select: { parfum: true, format: true, quantity: true, unitPrice: true },
    });

    // Agrège CA + pots par (parfum, format)
    // On normalise les libellés pour matcher avec Product.parfum.name / format.name
    const norm = (s: string | null | undefined) =>
      (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    // Map key = `${normParfum}__${normFormat}` → { ca, pots }
    const caByProduct = new Map<string, { ca: number; pots: number }>();
    let totalCAProduits = 0;
    let totalPots = 0;

    for (const vs of volumeSales) {
      if (!vs.parfum || !vs.format) continue;
      const unit = vs.unitPrice ?? 0;
      const ca = vs.quantity * unit;
      // potsPerColis dépend du format — on l'estime depuis le format du produit
      // (sera affiné ci-dessous via product.format.potsPerColis)
      const key = `${norm(vs.parfum)}__${norm(vs.format)}`;
      const cur = caByProduct.get(key) ?? { ca: 0, pots: 0 };
      cur.ca += ca;
      // pots: on additionne la quantité de colis ici, on divisera plus tard
      // par potsPerColis une fois le produit identifié
      cur.pots += vs.quantity;
      caByProduct.set(key, cur);
      totalCAProduits += ca;
      // (totalPots calculé après matching, car dépend de potsPerColis)
    }

    // 3. Charges directes (TTC) sur la période — filtrées par catégorie
    // Le Transport est TOUJOURS inclus. Marketing/Catalogues/Imprimés au choix.
    const charges = await db.charge.findMany({
      where: { date: { gte: start, lte: end } },
      select: { category: true, amountTTC: true, allocationMethod: true, enseigne: true },
    });

    // Catégories de charges directes sélectionnables
    const isTransportCat = (cat: string) => /transport|logistique/i.test(cat);
    const isMarketingCat = (cat: string) =>
      /marketing|publicit|annonce|catalogue|publication|concours|promotion/i.test(cat);
    const isCatalogueCat = (cat: string) => /catalogue|imprim|impression|edition|édition/i.test(cat);
    const isImprimesCat = (cat: string) => /imprim|impression|papeterie|fourniture/i.test(cat);

    let chargesTransport = 0;
    let chargesMarketing = 0;
    let chargesCatalogues = 0;
    let chargesImprimes = 0;
    const chargesParCategorie: Record<string, number> = {};

    for (const c of charges) {
      // On ne prend que les charges directes (allocationMethod DIRECT)
      if (c.allocationMethod !== 'DIRECT') continue;
      const cat = c.category;
      chargesParCategorie[cat] = (chargesParCategorie[cat] ?? 0) + c.amountTTC;
      if (isTransportCat(cat)) chargesTransport += c.amountTTC;
      else if (isMarketingCat(cat) && includeMarketing) chargesMarketing += c.amountTTC;
      else if (isCatalogueCat(cat) && includeCatalogues) chargesCatalogues += c.amountTTC;
      else if (isImprimesCat(cat) && includeImprimes) chargesImprimes += c.amountTTC;
    }

    const chargesDirectesTTC = chargesTransport + chargesMarketing + chargesCatalogues + chargesImprimes;

    // 4. Pour chaque produit: calcul marge/pot
    // Charges allouées au produit = chargesDirectesTTC × (CA produit / total CA produits)
    // Charges/pot = charges allouées / nb pots du produit
    const productResults = products.map((p) => {
      const parfumName = p.parfum?.name ?? '';
      const formatName = p.format?.name ?? '';
      const key = `${norm(parfumName)}__${norm(formatName)}`;
      const agg = caByProduct.get(key) ?? { ca: 0, pots: 0 };
      const potsPerColis = p.format?.potsPerColis ?? 1;
      const nbColis = agg.pots; // agg.pots contient les colis (cf. boucle ci-dessus)
      const nbPots = nbColis * potsPerColis;
      const caProduct = agg.ca;
      const prixVenteMoyenParPot = nbPots > 0 ? caProduct / nbPots : 0;
      const achatParPot = p.purchasePrices[0]?.pricePerPot ?? null;
      const achatParColis = p.purchasePrices[0]?.pricePerColis ?? null;

      const margeBruteParPot = achatParPot !== null ? prixVenteMoyenParPot - achatParPot : null;

      // Allocation des charges directes au prorata du CA du produit
      const partCA = totalCAProduits > 0 ? caProduct / totalCAProduits : 0;
      const chargesAllouees = chargesDirectesTTC * partCA;
      const chargesParPot = nbPots > 0 ? chargesAllouees / nbPots : 0;

      const margeNetteParPot = margeBruteParPot !== null ? margeBruteParPot - chargesParPot : null;
      const margePct = prixVenteMoyenParPot > 0 && margeNetteParPot !== null
        ? (margeNetteParPot / prixVenteMoyenParPot) * 100
        : null;

      return {
        productId: p.id,
        name: p.name,
        parfum: parfumName,
        format: formatName,
        potsPerColis,
        nbColis,
        nbPots,
        caProduct,
        prixVenteMoyenParPot,
        achatParPot,
        achatParColis,
        margeBruteParPot,
        chargesParPot,
        margeNetteParPot,
        margePct,
      };
    });

    // Calcule totalPots (somme des pots des produits matchés)
    totalPots = productResults.reduce((s, p) => s + p.nbPots, 0);

    return NextResponse.json({
      ok: true,
      products: productResults.sort((a, b) => b.caProduct - a.caProduct),
      totals: {
        chargesDirectesTTC,
        chargesTransport,
        chargesMarketing,
        chargesCatalogues,
        chargesImprimes,
        chargesParCategorie,
        totalCAProduits,
        totalPots,
        periode: {
          start: start.toISOString().split('T')[0],
          end: end.toISOString().split('T')[0],
        },
        options: {
          includeMarketing, includeCatalogues, includeImprimes,
          includeTransport: true, // toujours
        },
      },
    });
  } catch (e) {
    console.error('Erreur /api/products/marge-estimee:', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur serveur' },
      { status: 500 },
    );
  }
}
