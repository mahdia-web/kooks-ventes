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
 *   startDate=JJ/MM/AAAA    (default: 1er VolumeSale disponible)
 *   endDate=JJ/MM/AAAA      (default: dernier VolumeSale disponible)
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
      // Pas de dates fournies = mode "Tout": couvre toute la plage de données
      // disponible (du premier au dernier VolumeSale), pas seulement l'année en cours.
      const range = await db.volumeSale.aggregate({
        _min: { date: true },
        _max: { date: true },
      });
      const minDate = range._min.date;
      const maxDate = range._max.date;
      if (minDate && maxDate) {
        start = new Date(minDate);
        start.setHours(0, 0, 0, 0);
        end = new Date(maxDate);
        end.setHours(23, 59, 59);
      } else {
        // Aucune donnée : fallback sur l'année civile en cours
        const now = new Date();
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31);
      }
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
      select: { parfum: true, format: true, quantity: true, unitPrice: true, productLabel: true },
    });

    // Agrège CA + pots par (parfum, format)
    // On normalise les libellés pour matcher avec Product.parfum.name / format.name
    const norm = (s: string | null | undefined) =>
      (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[''`]/g, '').trim();

    // Helper: extrait parfum + format depuis le productLabel quand VolumeSale.parfum
    // ou VolumeSale.format sont null. Les règles d'extraction couvrent les libellés
    // ERP observés (COOKIE DOUGH PEANUT X2 BQ F, PAV 8*75G - PEANUT, etc.)
    const extractFromLabel = (label: string): { parfum: string | null; format: string | null } => {
      const l = (label || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      // Parfum
      let parfum: string | null = null;
      if (l.includes('PEANUT') || l.includes('Peanut Butter'.toUpperCase())) parfum = 'Peanut Butter';
      else if (l.includes('CRISPY') || l.includes('CRY CHOC') || l.includes('CHOCO')) parfum = 'Crispy Choco';
      else if (l.includes('CARAMEL') || l.includes('CARA')) parfum = 'Caramel Pecan';
      else if (l.includes('SPECUL') || l.includes('SPEC')) parfum = 'Speculoos';
      else if (l.includes('COCO') || l.includes('NOIX DE COCO')) parfum = 'Coco';
      else if (l.includes('ORIGINAL')) parfum = 'Original';
      // Format
      let format: string | null = null;
      if (l.includes('BOX 9') || l.includes('BOX DE 9') || l.includes('BOITE 9')) format = 'Box de 9';
      else if (l.includes('PAV 8') || l.includes('PAV*8') || l.includes('PAV 8*75G') || l.includes('INDIV') || l.includes('120 GR') || l.includes('75G')) format = 'Indiv PAV 8';
      else if (l.includes('X2') || l.includes('LOT 2') || l.includes('LOT DE 2') || l.includes('BQ F') || l.includes('SAC 5 KG')) format = 'Lot de 2';
      else if (l.includes('FOURO')) format = 'Indiv Fouro';
      return { parfum, format };
    };

    // Map key = `${normParfum}__${normFormat}` → { ca, pots }
    const caByProduct = new Map<string, { ca: number; pots: number }>();
    let totalCAProduits = 0;
    let totalPots = 0;

    for (const vs of volumeSales) {
      // Récupère parfum/format: priorité aux champs extraits, fallback sur productLabel
      let parfum = vs.parfum;
      let format = vs.format;
      if ((!parfum || !format) && vs.productLabel) {
        const ext = extractFromLabel(vs.productLabel);
        if (!parfum) parfum = ext.parfum;
        if (!format) parfum = ext.format;
      }
      if (!parfum || !format) continue; // toujours pas de match → on saute
      const unit = vs.unitPrice ?? 0;
      const ca = vs.quantity * unit;
      const key = `${norm(parfum)}__${norm(format)}`;
      const cur = caByProduct.get(key) ?? { ca: 0, pots: 0 };
      cur.ca += ca;
      cur.pots += vs.quantity;
      caByProduct.set(key, cur);
      totalCAProduits += ca;
    }

    // 3. Charges sur la période — directes ET indirectes
    // Le Transport est TOUJOURS inclus dans les directes. Marketing/Catalogues/Imprimés au choix.
    // On calcule aussi les charges indirectes (allocationMethod !== 'DIRECT') et le total.
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
    let chargesIndirectesTTC = 0; // allocationMethod !== 'DIRECT' (GLOBAL + PROPORTIONAL)
    let totalChargesTTC = 0;      // somme de TOUTES les charges (directes + indirectes)
    const chargesParCategorie: Record<string, number> = {};

    for (const c of charges) {
      totalChargesTTC += c.amountTTC;
      const cat = c.category;
      chargesParCategorie[cat] = (chargesParCategorie[cat] ?? 0) + c.amountTTC;

      // Charges directes (allocationMethod === 'DIRECT') — ventilées par catégorie
      // Seules ces catégories sont allouées au prorata du CA pour la marge nette/pot
      // (les achats matières premières sont déjà dans le prix d'achat, on ne les
      //  ré-alloue pas pour éviter un double compte).
      if (c.allocationMethod === 'DIRECT') {
        if (isTransportCat(cat)) chargesTransport += c.amountTTC;
        else if (isMarketingCat(cat) && includeMarketing) chargesMarketing += c.amountTTC;
        else if (isCatalogueCat(cat) && includeCatalogues) chargesCatalogues += c.amountTTC;
        else if (isImprimesCat(cat) && includeImprimes) chargesImprimes += c.amountTTC;
      } else {
        // Charge indirecte (GLOBAL ou PROPORTIONAL)
        chargesIndirectesTTC += c.amountTTC;
      }
    }

    // chargesDirectesTTC = somme des charges directes allouables au prorata du CA
    // (Transport + options). NB: les autres charges directes (achats, emballages)
    // sont dans chargesParCategorie et totalChargesTTC mais ne sont PAS ré-allouées
    // au pot pour éviter un double compte avec le prix d'achat.
    const chargesDirectesTTC = chargesTransport + chargesMarketing + chargesCatalogues + chargesImprimes;
    // chargesDirectesTotalTTC = TOUTES les charges directes (y compris achats/emballages)
    // pour l'affichage du total dans la synthèse.
    const chargesDirectesTotalTTC = totalChargesTTC - chargesIndirectesTTC;

    // 3b. CA HT total de la période (depuis Sale.amountHT — source de vérité du dashboard)
    //     VolumeSale donne un CA partiel (lignes avec parfum+format uniquement) qui ne
    //     correspond pas au CA officiel. On l'inclut pour aligner la grille tarifaire sur
    //     le dashboard et les autres "feuilles" (volumes, charges).
    const caAgg = await db.sale.aggregate({
      where: { date: { gte: start, lte: end } },
      _sum: { amountHT: true },
    });
    const totalCaHTPeriode = caAgg._sum.amountHT ?? 0;

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
        chargesDirectesTotalTTC,
        chargesTransport,
        chargesMarketing,
        chargesCatalogues,
        chargesImprimes,
        chargesIndirectesTTC,
        totalChargesTTC,
        chargesParCategorie,
        totalCAProduits,
        // CA HT officiel de la période (source: Sale.amountHT) — aligné sur le
        // dashboard et les autres feuilles (volumes, charges). totalCAProduits
        // (VolumeSale) reste dispo pour info mais ne doit PAS être utilisé comme
        // CA officiel car il exclut les lignes sans parfum/format.
        totalCaHTPeriode,
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
