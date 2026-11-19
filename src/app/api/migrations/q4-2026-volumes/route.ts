import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { db } from '@/lib/db';

export const maxDuration = 60;

/**
 * POST /api/migrations/q4-2026-volumes
 * Body: multipart/form-data avec un champ "file" (Excel)
 *
 * Importe les volumes (colis) pour septembre + octobre + novembre 2026
 * depuis un fichier Excel de détail produits ERP.
 *
 * Source: export-1795100361416.xlsx fourni par l'utilisateur (2026-11-19).
 *   - 763 BL uniques, 424 602 € HT, 33 735 colis
 *   - Couvre: sept 2026 (277 BL, 150k€) + oct 2026 (290 BL, 170k€) + nov 2026 (196 BL)
 *
 * Le fichier n'a PAS de colonne Date, seulement une colonne "Référence" (numéro BL).
 * On récupère donc la vraie date de chaque BL depuis la table Sale.
 * Pour les BL non trouvés dans Sale (195 BL), on infère le mois:
 *   - BL >= 26000600 → novembre 2026 (séquence continue après octobre)
 *   - BL < 26000600  → septembre 2026 (interpolation: premier BL du fichier = 1er sept)
 *
 * Étapes:
 *   1. Parse le fichier Excel (3123 lignes détail)
 *   2. Récupère toutes les dates BL depuis Sale
 *   3. Supprime les VolumeSale existants pour sept+oct+nov 2026
 *   4. Pour chaque ligne, détermine date + parfum + format + quantity + unitPrice
 *   5. Insère par lots dans VolumeSale
 */
export async function POST(req: NextRequest) {
  console.log('[q4-2026-volumes] Starting import — 3123 lines expected');

  try {
    const formData = await req.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ ok: false, error: 'Aucun fichier reçu (champ "file" requis)' }, { status: 400 });
    }

    console.log(`[q4-2026-volumes] File: ${file.name} (${file.size} bytes)`);
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    console.log(`[q4-2026-volumes] Sheet: ${sheetName}`);

    // Lecture en raw (préserve les références comme string)
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      raw: true,
      defval: null,
      range: 0, // ligne 1 = headers
    });

    if (rows.length === 0) {
      return NextResponse.json({ ok: false, error: 'Fichier vide' }, { status: 400 });
    }

    // Mapping des colonnes (le fichier a: Référence, Client, Produit, Colis, Nb. Colis, Pièces, PU, Total HT, Total Ac ligne)
    const headers = Object.keys(rows[0]);
    const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[''`]/g, '').trim();
    const findCol = (patterns: string[]): string | null => {
      for (const p of patterns) {
        const pl = normalize(p);
        const f = headers.find(h => normalize(h) === pl);
        if (f) return f;
      }
      for (const p of patterns) {
        const pl = normalize(p);
        const f = headers.find(h => { const hl = normalize(h); return hl.includes(pl); });
        if (f) return f;
      }
      return null;
    };

    const colRef = findCol(['Référence', 'Reference', 'Ref']);
    const colClient = findCol(['Client', 'Enseigne']);
    const colProduit = findCol(['Produit', 'Libellé', 'Libelle']);
    const colFormat = findCol(['Colis', 'Format']); // BARQUETTE PCB 6, COLIS PCB 4, COLIS PCB 8
    const colQte = findCol(['Nb. Colis', 'Nb Colis', 'Qté', 'Quantité']);
    const colPU = findCol(['PU']);
    const colHT = findCol(['Total HT']);

    console.log(`[q4-2026-volumes] Columns: ref=${colRef}, client=${colClient}, produit=${colProduit}, format=${colFormat}, qte=${colQte}, pu=${colPU}, ht=${colHT}`);

    if (!colRef || !colClient || !colProduit || !colQte) {
      return NextResponse.json({
        ok: false,
        error: `Colonnes manquantes. Détecté: ${headers.join(', ')}`,
      }, { status: 400 });
    }

    // Filtre les lignes de données (saute la ligne TOTAL)
    const dataRows = rows.filter(r => {
      const produit = r[colProduit];
      return produit && String(produit).trim().toUpperCase() !== 'TOTAL';
    });

    console.log(`[q4-2026-volumes] ${dataRows.length} data rows (after TOTAL filter)`);

    // 1) Récupère toutes les BL refs du fichier
    const blRefs = new Set<string>();
    for (const r of dataRows) {
      const ref = r[colRef];
      if (ref != null) blRefs.add(String(ref).trim());
    }
    console.log(`[q4-2026-volumes] ${blRefs.size} unique BL refs in file`);

    // 2) Récupère les dates depuis Sale pour ces BL
    const sales = await db.sale.findMany({
      where: { blNumber: { in: Array.from(blRefs) } },
      select: { blNumber: true, date: true },
    });
    const blDateMap = new Map<string, Date>();
    for (const s of sales) {
      if (s.blNumber) blDateMap.set(s.blNumber, s.date);
    }
    console.log(`[q4-2026-volumes] Found ${blDateMap.size} matching sales (out of ${blRefs.size} BLs)`);

    // 3) Pour les BL non trouvés dans Sale, infère le mois
    // BL >= 26000600 → novembre 2026 (15 nov = mi-mois)
    // BL < 26000600  → septembre 2026 (15 sept = mi-mois)
    const inferDate = (refStr: string): Date => {
      const m = refStr.match(/^(\d{8,})$/);
      if (m) {
        const num = parseInt(m[1], 10);
        if (num >= 26000600) return new Date(2026, 10, 15); // 15 nov 2026
        return new Date(2026, 8, 15); // 15 sept 2026
      }
      return new Date(2026, 10, 15); // fallback novembre
    };

    // 4) Supprime les VolumeSale existants pour sept+oct+nov 2026
    // Ces données ont été importées via l'ancien fichier FV-xxxxx (474 BL novembre)
    // et sont incomplètes (manque sept+oct). On repart de zéro.
    const deleted = await db.volumeSale.deleteMany({
      where: {
        AND: [
          { year: 2026 },
          { month: { in: [9, 10, 11] } },
        ],
      },
    });
    console.log(`[q4-2026-volumes] Deleted ${deleted.count} existing VolumeSale for sept+oct+nov 2026`);

    // 5) Extraction parfum/format (même logique que /api/volumes/import)
    const PARFUM_KEYWORDS = ['ORIGINAL', 'PEANUT BUTTER', 'CRISPY CHOCO', 'CARAMEL PECAN', 'SPECULOOS', 'COCO', 'SPEC'];
    const FORMAT_KEYWORDS: Array<[string, string]> = [
      ['LOT 2', 'Lot de 2'], ['LOT DE 2', 'Lot de 2'],
      ['BOX 9', 'Box de 9'], ['BOX DE 9', 'Box de 9'],
      ['PAV 8', 'Indiv PAV 8'], ['PAV8', 'Indiv PAV 8'],
      ['FOURO', 'Indiv Fouro'], ['INDIV', 'Indiv Fouro'],
      ['BARQUETTE PCB 6', 'Lot de 2'], ['COLIS PCB 8', 'Indiv PAV 8'],
      ['X2 BQ', 'Lot de 2'], ['X1 PAV', 'Indiv PAV 8'], ['ETUI X9', 'Box de 9'],
    ];
    const COLIS_FORMAT_MAP: Record<string, string> = {
      'BARQUETTE PCB 6': 'Lot de 2',
      'COLIS PCB 4': 'Box de 9',
      'COLIS PCB 8': 'Indiv PAV 8',
    };

    const toInsert: Array<{
      date: Date; month: number; year: number; enseigne: string;
      productLabel: string; parfum: string | null; format: string | null;
      quantity: number; unitPrice: number | null; factureRef: string | null;
    }> = [];

    let skipped = 0;
    let inferredCount = 0;

    for (const row of dataRows) {
      const refRaw = row[colRef];
      if (refRaw == null) { skipped++; continue; }
      const refStr = String(refRaw).trim();
      if (!refStr) { skipped++; continue; }

      const clientStr = String(row[colClient] ?? '').trim();
      const productLabel = String(row[colProduit] ?? '').trim();
      if (!clientStr || !productLabel) { skipped++; continue; }

      // Date: priorité Sale, sinon inférée
      let date: Date;
      if (blDateMap.has(refStr)) {
        date = blDateMap.get(refStr)!;
      } else {
        date = inferDate(refStr);
        inferredCount++;
      }

      // Quantity (Nb. Colis)
      let quantity = 0;
      const qteRaw = row[colQte];
      if (typeof qteRaw === 'number') quantity = Math.floor(qteRaw);
      else if (typeof qteRaw === 'string') quantity = Math.floor(parseFloat(qteRaw.replace(/[^\d.-]/g, '')) || 0);
      if (quantity < 0) quantity = 0; // avoirs = 0 colis

      // Parfum
      const labelUpper = productLabel.toUpperCase();
      let parfum: string | null = null;
      for (const kw of PARFUM_KEYWORDS) {
        if (labelUpper.includes(kw)) {
          parfum = kw === 'SPEC' && !labelUpper.includes('SPECULOOS') ? 'Speculoos' : kw.charAt(0) + kw.slice(1).toLowerCase();
          break;
        }
      }

      // Format: priorité colonne 'Colis' (format ERP), puis libellé
      let format: string | null = null;
      if (colFormat) {
        const formatVal = String(row[colFormat] ?? '').trim().toUpperCase();
        if (formatVal && COLIS_FORMAT_MAP[formatVal]) {
          format = COLIS_FORMAT_MAP[formatVal];
        }
      }
      if (!format) {
        for (const [kw, label] of FORMAT_KEYWORDS) {
          if (labelUpper.includes(kw)) { format = label; break; }
        }
      }

      // Unit price (PU)
      let unitPrice: number | null = null;
      const puRaw = row[colPU];
      if (typeof puRaw === 'number') unitPrice = puRaw;
      else if (typeof puRaw === 'string') {
        const n = parseFloat(String(puRaw).replace(/\s/g, '').replace(',', '.'));
        if (!isNaN(n)) unitPrice = n;
      }

      toInsert.push({
        date,
        month: date.getMonth() + 1,
        year: date.getFullYear(),
        enseigne: clientStr,
        productLabel,
        parfum,
        format,
        quantity,
        unitPrice,
        factureRef: refStr,
      });
    }

    console.log(`[q4-2026-volumes] Prepared ${toInsert.length} rows (${skipped} skipped, ${inferredCount} dates inférées)`);

    // 6) Insertion par lots
    const BATCH_SIZE = 500;
    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE);
      try {
        const result = await db.volumeSale.createMany({ data: batch, skipDuplicates: true });
        inserted += result.count;
      } catch (e) {
        console.error(`[q4-2026-volumes] Batch ${i} failed, fallback 1-by-1:`, e);
        for (const item of batch) {
          try { await db.volumeSale.create({ data: item }); inserted++; } catch { skipped++; }
        }
      }
    }

    console.log(`[q4-2026-volumes] Done: ${inserted} inserted, ${skipped} skipped`);

    // 7) Stats par mois pour vérification
    const byMonth = new Map<string, { count: number; colis: number; ht: number }>();
    for (const item of toInsert) {
      const key = `${item.year}-${String(item.month).padStart(2, '0')}`;
      if (!byMonth.has(key)) byMonth.set(key, { count: 0, colis: 0, ht: 0 });
      const v = byMonth.get(key)!;
      v.count++;
      v.colis += item.quantity;
      v.ht += (item.unitPrice ?? 0) * item.quantity;
    }

    return NextResponse.json({
      ok: true,
      result: {
        inserted,
        skipped,
        total: toInsert.length,
        inferredDates: inferredCount,
        deletedBefore: deleted.count,
        byMonth: Array.from(byMonth.entries()).map(([k, v]) => ({ month: k, lines: v.count, colis: v.colis, ht: Math.round(v.ht * 100) / 100 })),
      },
    });
  } catch (e) {
    console.error('[q4-2026-volumes] Error:', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur serveur' },
      { status: 500 }
    );
  }
}
