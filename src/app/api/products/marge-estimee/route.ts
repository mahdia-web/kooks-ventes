import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const maxDuration = 60;
// Les marges dépendent des toggles de charges (excludedFromMargin) qui changent
// à l'édition : ne jamais cacher cette route.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/products/marge-estimee
 *
 * Calcule la marge estimée par pot pour chaque référence (parfum × format),
 * en incluant une part des charges directes (TTC) allouée au prorata du CA.
 *
 * Query params:
 *   includeDirectes=true|false   (default true)  — toutes les charges classées DIRECT
 *   includeIndirectes=true|false (default false) — toutes les charges classées INDIRECT
 *   includeSalaires=true|false   (default true)  — les salaires (poste lourd, géré à part)
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
    const includeDirectes = searchParams.get('includeDirectes') !== 'false';
    const includeIndirectes = searchParams.get('includeIndirectes') === 'true';
    const includeSalaires = searchParams.get('includeSalaires') !== 'false';

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
        // pricePerFormat = prix d'achat d'UN format (lot de 2, boîte de 9...).
        // C'est l'unité comparable au PU de vente (qui est aussi par format).
        // pricePerColis = prix d'achat d'un colis logistique (peut contenir plusieurs
        // formats) — NON comparable au PU de vente ; gardé pour info seulement.
        purchasePrices: { where: { endDate: null }, take: 1, select: { pricePerPot: true, pricePerFormat: true, pricePerColis: true } },
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
    // ERP observés (COOKIE DOUGH PEANUT X2 BQ F, PAV 8*75G - PEANUT, SAC 5 KG, etc.)
    // Mapping confirmé par l'utilisateur:
    //   - "X2 BQ" (± "F" = frais) → Lot de 2
    //   - "PAV 8*75G" (± variante PAV*8, PAV 8) → Indiv PAV 8
    //   - "SAC 5 KG" / "SACHET 5 KG" (format CHR) → Sachet
    const extractFromLabel = (label: string): { parfum: string | null; format: string | null } => {
      const l = (label || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      // Parfum
      let parfum: string | null = null;
      if (l.includes('PEANUT')) parfum = 'Peanut Butter';
      else if (l.includes('CRISPY') || l.includes('CRY CHOC')) parfum = 'Crispy Choco';
      else if (l.includes('CARAMEL') || l.includes('CARA')) parfum = 'Caramel Pecan';
      else if (l.includes('SPECUL') || l.includes('SPEC')) parfum = 'Speculoos';
      else if (l.includes('COCO') || l.includes('NOIX DE COCO')) parfum = 'Coco';
      else if (l.includes('ORIGINAL')) parfum = 'Original';
      // Format — patterns clairs uniquement (par ordre de priorité)
      let format: string | null = null;
      if (l.includes('BOX 9') || l.includes('BOX DE 9') || l.includes('BOITE 9')) format = 'Box de 9';
      else if (l.includes('PAV 8') || l.includes('PAV*8') || l.includes('PAV 8*75G')) format = 'Indiv PAV 8';
      else if (l.includes('SAC 5 KG') || l.includes('SACHET 5 KG') || l.includes('SACHET 5KG') || l.includes('SAC 5KG')) format = 'Sachet';
      else if (l.includes('X2') || l.includes('LOT 2') || l.includes('LOT DE 2') || l.includes('BQ F') || l.includes('BQ')) format = 'Lot de 2';
      else if (l.includes('FOURO')) format = 'Indiv Fouro';
      return { parfum, format };
    };

    // Map key = `${normParfum}__${normFormat}` → { ca, pots }
    const caByProduct = new Map<string, { ca: number; pots: number; puSum: number; puCount: number }>();
    let totalCAProduits = 0;
    let totalPots = 0;

    for (const vs of volumeSales) {
      // Récupère parfum/format: priorité aux champs extraits, fallback sur productLabel
      let parfum = vs.parfum;
      let format = vs.format;
      if ((!parfum || !format) && vs.productLabel) {
        const ext = extractFromLabel(vs.productLabel);
        if (!parfum) parfum = ext.parfum;
        if (!format) format = ext.format;
      }
      if (!parfum || !format) continue; // toujours pas de match → on saute
      const unit = vs.unitPrice ?? 0;
      const ca = vs.quantity * unit;
      const key = `${norm(parfum)}__${norm(format)}`;
      // ca  = somme des CA réels importés (quantity × PU HT)
      // puSum / puCount = somme et nombre des PU renseignés (pour la MOYENNE
      //   arithmétique des prix unitaires par produit, demandée par l'utilisateur)
      // pots = somme des colis (quantity) — convertis en pots plus bas
      const cur = caByProduct.get(key) ?? { ca: 0, pots: 0, puSum: 0, puCount: 0 };
      cur.ca += ca;
      cur.pots += vs.quantity; // quantity = nombre de FORMATS vendus (box, lot...)
      if (vs.unitPrice != null && vs.unitPrice > 0) {
        cur.puSum += vs.unitPrice;
        cur.puCount += 1;
      }
      caByProduct.set(key, cur);
      totalCAProduits += ca;
    }

    // 3. Charges sur la période — directes ET indirectes
    // Le Transport est TOUJOURS inclus dans les directes. Marketing/Catalogues/Imprimés au choix.
    // On calcule aussi les charges indirectes (allocationMethod !== 'DIRECT') et le total.
    const charges = await db.charge.findMany({
      where: { date: { gte: start, lte: end } },
      select: { category: true, amountTTC: true, allocationMethod: true, enseigne: true, excludedFromMargin: true },
    });

    // Catégories de charges directes sélectionnables
    const isTransportCat = (cat: string) => /transport|logistique/i.test(cat);
    const isMarketingCat = (cat: string) =>
      /marketing|publicit|annonce|publication|concours|promotion/i.test(cat);
    // NB: "catalogue" est retire du pattern marketing car "Catalogues, imprimés &
    // brochures" est une categorie distincte (captee par isCatalogueCat ci-dessous).
    const isCatalogueCat = (cat: string) => /catalogue|imprim|impression|edition|édition/i.test(cat);
    const isImprimesCat = (cat: string) => /imprim|impression|papeterie|fourniture/i.test(cat);
    const isSalairesCat = (cat: string) => /salaire|rémunération|paie/i.test(cat);
    // Charges directes EXCLUES de l'allocation aux pots car déjà dans le prix
    // d'achat (achats matières premières, emballages & conditionnements).
    // Tout autre catégorie marquée DIRECTE est allouée au prorata du CA.
    const isAchatMatieresCat = (cat: string) =>
      /achat.*matière|matière.*achat|matières premières/i.test(cat);
    const isEmballageCat = (cat: string) =>
      /emballage|conditionnement/i.test(cat);

    let chargesTransport = 0;        // compteur affichage (DIRECT)
    let chargesMarketing = 0;        // compteur affichage (DIRECT)
    let chargesCatalogues = 0;       // compteur affichage (DIRECT)
    let chargesImprimes = 0;         // compteur affichage (DIRECT)
    let chargesSalaires = 0;         // compteur affichage (DIRECT + INDIRECT, toutes lignes)
    let salairesExcludedTTC = 0;     // salaires retirés individuellement de la marge
    let chargesDirectesAutresTTC = 0; // compteur affichage (Honoraires, Loyer, Logiciels DIRECT)
    let chargesDirectesExcluesTTC = 0; // achats matières + emballages (déjà dans prix d'achat)
    let chargesIndirectesTTC = 0;    // compteur affichage (allocationMethod !== 'DIRECT')
    let totalChargesTTC = 0;         // somme de TOUTES les charges
    const chargesParCategorie: Record<string, number> = {};

    // On calcule DEUX montants alloués au prorata du CA pour offrir une double
    // visibilité dans la grille tarifaire :
    //   - chargesHorsSalairesTTC : charges directes (hors salaires/exclus) + indirectes,
    //     selon les toggles includeDirectes / includeIndirectes.
    //   - chargesAvecSalairesTTC : chargesHorsSalairesTTC + salaires (toggle includeSalaires).
    // La marge "hors salaire" et "avec salaire" sont ainsi toutes deux disponibles
    // côté UI sans recharger l'API.
    let chargesHorsSalairesTTC = 0; // directes (hors salaires) + indirectes selon toggles
    let salairesAllouablesTTC = 0;  // salaires (toggles includeSalaires)

    for (const c of charges) {
      totalChargesTTC += c.amountTTC;
      const cat = c.category;
      chargesParCategorie[cat] = (chargesParCategorie[cat] ?? 0) + c.amountTTC;

      const isDirect = c.allocationMethod === 'DIRECT';
      const isSalaires = isSalairesCat(cat);
      const isExclu = isAchatMatieresCat(cat) || isEmballageCat(cat); // déjà dans prix d'achat

      // 1) Compteurs d'affichage (indépendants des toggles) pour la synthèse
      if (isSalaires) {
        chargesSalaires += c.amountTTC;
        if (c.excludedFromMargin === true) salairesExcludedTTC += c.amountTTC;
      } else if (isDirect) {
        if (isExclu) {
          chargesDirectesExcluesTTC += c.amountTTC;
        } else if (isTransportCat(cat)) chargesTransport += c.amountTTC;
        else if (isMarketingCat(cat)) chargesMarketing += c.amountTTC;
        else if (isCatalogueCat(cat)) chargesCatalogues += c.amountTTC;
        else if (isImprimesCat(cat)) chargesImprimes += c.amountTTC;
        else chargesDirectesAutresTTC += c.amountTTC;
      } else {
        chargesIndirectesTTC += c.amountTTC;
      }

      // 2) Allocation effective au prorata du CA selon les toggles
      //    - Salaires : toggle includeSalaires (poste séparé pour la double visibilité)
      //      + toggle individuel excludedFromMargin (ligne retirée de la marge par l'utilisateur)
      //    - Charges directes (hors salaires, hors achats/emballages exclus) : toggle includeDirectes
      //    - Charges indirectes (hors salaires) : toggle includeIndirectes
      //    Les achats matières + emballages directs ne sont JAMAIS alloués (déjà dans prix d'achat).
      //    Une ligne marquée excludedFromMargin=true n'est jamais allouée (retrait individuel).
      const isManuallyExcluded = c.excludedFromMargin === true;
      if (isSalaires) {
        if (includeSalaires && !isManuallyExcluded) salairesAllouablesTTC += c.amountTTC;
      } else if (isDirect) {
        if (!isExclu && includeDirectes && !isManuallyExcluded) chargesHorsSalairesTTC += c.amountTTC;
      } else {
        if (includeIndirectes && !isManuallyExcluded) chargesHorsSalairesTTC += c.amountTTC;
      }
    }

    // Montants alloués au prorata du CA (les achats matières premières et
    // emballages directs restent exclus — déjà dans le prix d'achat).
    const chargesDirectesTTC = chargesHorsSalairesTTC + salairesAllouablesTTC; // rétro-compat
    // chargesDirectesTotalTTC = TOUTES les charges directes (y compris
    // achats/emballages) pour l'affichage du total dans la synthèse.
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
      const agg = caByProduct.get(key) ?? { ca: 0, pots: 0, puSum: 0, puCount: 0 };

      // === Nomenclature (ne plus confondre format et colis) ===
      // VolumeSale.quantity  = nombre de FORMATS vendus (box, lot...)  ← unité d'import
      // VolumeSale.unitPrice = PU HT d'UN FORMAT (prix de vente d'une box/lot)
      // Format.potsPerFormat           = nb de pots dans 1 format (Lot2=2, Box9=9)
      // Format.unitesFormatPerColis    = nb de formats dans 1 colis logistique (Lot2=6, Box9=4)
      // Format.potsPerColis            = nb de pots dans 1 colis logistique (Lot2=12, Box9=36)
      const potsPerFormat = p.format?.potsPerFormat ?? 1;
      const formatsPerColis = p.format?.unitesFormatPerColis ?? 1; // formats par colis logistique
      const potsPerColis = p.format?.potsPerColis ?? potsPerFormat * formatsPerColis;

      const nbFormats = agg.pots;             // VolumeSale.quantity agrégé (= nb formats vendus)
      const nbColis = formatsPerColis > 0 ? nbFormats / formatsPerColis : nbFormats; // colis logistiques
      const nbPots = nbFormats * potsPerFormat;
      const caProduct = agg.ca;

      // Prix de vente moyen par FORMAT = moyenne arithmétique des PU HT importés
      // (l'unité d'import est le format : box, lot...).
      // Fallback : CA / nbFormats si aucun PU renseigné.
      const prixVenteMoyenParFormat = agg.puCount > 0
        ? agg.puSum / agg.puCount
        : (nbFormats > 0 ? caProduct / nbFormats : 0);
      // Prix de vente moyen par COLIS logistique = PU format × formats/colis
      const prixVenteMoyenParColis = prixVenteMoyenParFormat * formatsPerColis;
      const prixVenteMoyenParPot = potsPerFormat > 0 ? prixVenteMoyenParFormat / potsPerFormat : 0;

      // === Prix d'achat ===
      const pp = p.purchasePrices[0];
      const achatParPot = pp?.pricePerPot ?? null;
      // achatParFormat = prix d'achat d'un format (lot de 2, box de 9).
      // Fallback : pricePerPot × potsPerFormat.
      const achatParFormat = pp?.pricePerFormat
        ?? (pp?.pricePerPot != null ? pp.pricePerPot * potsPerFormat : null);
      // achatParColis = prix d'achat d'un colis LOGISTIQUE (pricePerColis).
      // Fallback : achatParFormat × formatsPerColis.
      const achatParColis = pp?.pricePerColis
        ?? (achatParFormat !== null ? achatParFormat * formatsPerColis : null);

      // === Marges brutes (avant charges) ===
      const margeBruteParPot = achatParPot !== null ? prixVenteMoyenParPot - achatParPot : null;
      const margeBruteParFormat = achatParFormat !== null ? prixVenteMoyenParFormat - achatParFormat : null;
      const margeBruteParColis = achatParColis !== null ? prixVenteMoyenParColis - achatParColis : null;

      // === Allocation des charges au prorata du CA du produit — 2 scénarios ===
      //   - hors salaire : charges directes (hors salaires/exclus) + indirectes
      //   - avec salaire : + salaires
      const partCA = totalCAProduits > 0 ? caProduct / totalCAProduits : 0;
      const chargesHorsSalairesAllouees = chargesHorsSalairesTTC * partCA;
      const salairesAlloues = salairesAllouablesTTC * partCA;

      // --- Scénario 1 : HORS SALAIRE (par format, par colis, par pot) ---
      const chargesHorsSalairesParFormat = nbFormats > 0 ? chargesHorsSalairesAllouees / nbFormats : 0;
      const chargesHorsSalairesParColis = nbColis > 0 ? chargesHorsSalairesAllouees / nbColis : 0;
      const chargesHorsSalairesParPot = nbPots > 0 ? chargesHorsSalairesAllouees / nbPots : 0;
      const margeNetteHorsSalairesParFormat = margeBruteParFormat !== null ? margeBruteParFormat - chargesHorsSalairesParFormat : null;
      const margeNetteHorsSalairesParColis = margeBruteParColis !== null ? margeBruteParColis - chargesHorsSalairesParColis : null;
      const margeNetteHorsSalairesParPot = margeBruteParPot !== null ? margeBruteParPot - chargesHorsSalairesParPot : null;
      // Marge % calculée sur le FORMAT (unité de vente de l'import)
      const margeHorsSalairesPct = prixVenteMoyenParFormat > 0 && margeNetteHorsSalairesParFormat !== null
        ? (margeNetteHorsSalairesParFormat / prixVenteMoyenParFormat) * 100 : null;

      // --- Scénario 2 : AVEC SALAIRE ---
      const salairesParFormat = nbFormats > 0 ? salairesAlloues / nbFormats : 0;
      const salairesParColis = nbColis > 0 ? salairesAlloues / nbColis : 0;
      const salairesParPot = nbPots > 0 ? salairesAlloues / nbPots : 0;
      const chargesParFormat = chargesHorsSalairesParFormat + salairesParFormat;
      const chargesParColis = chargesHorsSalairesParColis + salairesParColis;
      const chargesParPot = chargesHorsSalairesParPot + salairesParPot;
      const margeNetteParFormat = margeBruteParFormat !== null ? margeBruteParFormat - chargesParFormat : null;
      const margeNetteParColis = margeBruteParColis !== null ? margeBruteParColis - chargesParColis : null;
      const margeNetteParPot = margeBruteParPot !== null ? margeBruteParPot - chargesParPot : null;
      const margePct = prixVenteMoyenParFormat > 0 && margeNetteParFormat !== null
        ? (margeNetteParFormat / prixVenteMoyenParFormat) * 100
        : null;

      return {
        productId: p.id,
        name: p.name,
        parfum: parfumName,
        format: formatName,
        // Caractéristiques du format
        potsPerFormat,
        formatsPerColis,
        potsPerColis,
        // Volumes (période)
        nbFormats,            // formats vendus (= VolumeSale.quantity agrégé)
        nbColis,              // colis logistiques (= nbFormats / formatsPerColis)
        nbPots,               // pots (= nbFormats × potsPerFormat)
        caProduct,            // CA = somme(quantity × PU HT)
        // Prix de vente moyen (moyenne arithmétique des PU HT importés)
        prixVenteMoyenParFormat,  // PU moyen d'un format (box, lot) — unité d'import
        prixVenteMoyenParColis,   // PU moyen d'un colis logistique (= PU format × formats/colis)
        prixVenteMoyenParPot,
        // Prix d'achat
        achatParPot,
        achatParFormat,           // prix d'achat d'un format (lot, box)
        achatParColis,            // prix d'achat d'un colis logistique
        // Marges brutes (avant charges)
        margeBruteParPot,
        margeBruteParFormat,
        margeBruteParColis,
        // Scénario HORS salaire
        chargesHorsSalairesParFormat,
        chargesHorsSalairesParColis,
        chargesHorsSalairesParPot,
        margeNetteHorsSalairesParFormat,
        margeNetteHorsSalairesParColis,
        margeNetteHorsSalairesParPot,
        margeHorsSalairesPct,
        // Scénario AVEC salaire
        salairesParFormat,
        salairesParColis,
        salairesParPot,
        chargesParFormat,
        chargesParColis,
        chargesParPot,
        margeNetteParFormat,
        margeNetteParColis,
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
        chargesSalaires,
        salairesExcludedTTC,
        salairesAllouablesTTC,
        chargesDirectesAutresTTC,
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
          includeDirectes, includeIndirectes, includeSalaires,
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
