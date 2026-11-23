import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { db } from '@/lib/db';

export const maxDuration = 60;

/**
 * POST /api/migrations/q4-2026-volumes
 * Body: multipart/form-data avec un champ "file" (Excel)
 *
 * Importe les volumes (colis) pour août + septembre + octobre 2026
 * depuis un fichier Excel de détail produits ERP avec VRAIES DATES.
 *
 * Source: export-1795434544738.xlsx fourni par l'utilisateur (2026-11-23).
 *   - 603 BL uniques, 333 564 € HT, 26 413 colis, 2444 lignes
 *   - Colonne "Date d'expédition" (DD/MM/YYYY) → vraies dates
 *   - Couvre: 27/08/2026 → 30/10/2026
 *     * Août 2026: 6 BL, 348 colis, 7 370 € HT
 *     * Septembre 2026: 300 BL, 12 257 colis, 156 020 € HT
 *     * Octobre 2026: 297 BL, 13 808 colis, 170 174 € HT
 *
 * CA cohérents avec le dashboard Sale:
 *   - Sept Sale = 149 759 € → fichier = 156 020 € (écart avoirs) ✓
 *   - Oct Sale = 170 250 € → fichier = 170 174 € (quasi identique) ✓
 *
 * Étapes:
 *   1. Parse le fichier Excel (2444 lignes détail)
 *   2. Pour chaque ligne, lit la date d'expédition (priorité 1)
 *      Fallback: date du BL depuis Sale, sinon 15 du mois inféré
 *   3. Supprime les VolumeSale existants pour août+sept+oct 2026
 *      (ceux importés avec dates inférées 15/09, 15/10, 15/11)
 *   4. Insère les nouvelles lignes avec vraies dates + parfum + format + quantity + PU
 */
export async function POST(req: NextRequest) {
    console.log('[q4-2026-volumes] Starting import');

    try {
    const formData = await req.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ ok: false, error: 'Aucun fichier reçu (champ "file" requis)' }, { status: 400 });
    }

    // Paramètres optionnels:
    //   forceMonth (1-12) + forceYear: force toutes les lignes à ce mois (pour fichiers sans colonne Date)
    //   deleteMonths (comma-separated): quels mois supprimer avant import (ex: "8,9,10" ou "11")
    //   filterBlMin (int): ne garde que les BL dont le numéro >= cette valeur (ex: 26000600 pour novembre seulement)
    const forceMonthRaw = String(formData.get('forceMonth') ?? '');
    const forceYearRaw = String(formData.get('forceYear') ?? '2026');
    const deleteMonthsRaw = String(formData.get('deleteMonths') ?? '');
    const filterBlMinRaw = String(formData.get('filterBlMin') ?? '');
    const forceMonth = forceMonthRaw ? parseInt(forceMonthRaw, 10) : 0;
    const forceYear = parseInt(forceYearRaw, 10) || 2026;
    const deleteMonths: number[] = deleteMonthsRaw
      ? deleteMonthsRaw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n >= 1 && n <= 12)
      : [];
    const filterBlMin = filterBlMinRaw ? parseInt(filterBlMinRaw, 10) : 0;

    console.log(`[q4-2026-volumes] forceMonth=${forceMonth || 'none'}, forceYear=${forceYear}, deleteMonths=${JSON.stringify(deleteMonths)}, filterBlMin=${filterBlMin || 'none'}`);

    console.log(`[q4-2026-volumes] File: ${file.name} (${file.size} bytes)`);
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    console.log(`[q4-2026-volumes] Sheet: ${sheetName}`);

    // Lecture avec cellDates: true → les dates deviennent des objets Date JS
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      raw: true,
      defval: null,
      range: 0, // ligne 1 = headers
    });

    if (rows.length === 0) {
      return NextResponse.json({ ok: false, error: 'Fichier vide' }, { status: 400 });
    }

    // Mapping des colonnes
    // Nouveau fichier: Référence, Date d'expédition, Client, Produit, Colis, Nb. Colis, Pièces, PU, Total HT, Total Ac ligne
    const headers = Object.keys(rows[0]);
    const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[''`]/g, '').trim();
    const findCol = (patterns: string[]): string | null => {
      // Pass 1: match exact normalisé
      for (const p of patterns) {
        const pl = normalize(p);
        const f = headers.find(h => normalize(h) === pl);
        if (f) return f;
      }
      // Pass 2: header contient le pattern (header plus long)
      for (const p of patterns) {
        const pl = normalize(p);
        const f = headers.find(h => { const hl = normalize(h); return hl.includes(pl); });
        if (f) return f;
      }
      return null;
    };

    const colRef = findCol(['Référence', 'Reference', 'Ref']);
    const colDate = findCol(["Date d'expédition", "Date d'expedition", 'Date expedition', 'Date expédition', 'Date', 'date']);
    const colClient = findCol(['Client', 'Enseigne']);
    const colProduit = findCol(['Produit', 'Libellé', 'Libelle']);
    const colFormat = findCol(['Colis', 'Format']); // BARQUETTE PCB 6, COLIS PCB 4, COLIS PCB 8
    const colQte = findCol(['Nb. Colis', 'Nb Colis', 'Qté', 'Quantité']);
    const colPU = findCol(['PU']);
    const colHT = findCol(['Total HT']);

    console.log(`[q4-2026-volumes] Columns: ref=${colRef}, date=${colDate}, client=${colClient}, produit=${colProduit}, format=${colFormat}, qte=${colQte}, pu=${colPU}, ht=${colHT}`);

    if (!colRef || !colClient || !colProduit || !colQte) {
      return NextResponse.json({
        ok: false,
        error: `Colonnes manquantes. Détecté: ${headers.join(', ')}`,
      }, { status: 400 });
    }

    if (!colDate) {
      console.warn('[q4-2026-volumes] WARNING: pas de colonne Date détectée — fallback sur Sale/inférence');
    }

    // Filtre les lignes de données (saute la ligne TOTAL)
    const dataRows = rows.filter(r => {
      const produit = r[colProduit];
      return produit && String(produit).trim().toUpperCase() !== 'TOTAL';
    });

    console.log(`[q4-2026-volumes] ${dataRows.length} data rows (after TOTAL filter)`);

    // 1) Récupère toutes les BL refs du fichier (pour fallback date via Sale)
    const blRefs = new Set<string>();
    for (const r of dataRows) {
      const ref = r[colRef];
      if (ref != null) blRefs.add(String(ref).trim());
    }
    console.log(`[q4-2026-volumes] ${blRefs.size} unique BL refs in file`);

    // 2) Récupère les dates depuis Sale (fallback si pas de colonne Date)
    const sales = await db.sale.findMany({
      where: { blNumber: { in: Array.from(blRefs) } },
      select: { blNumber: true, date: true },
    });
    const blDateMap = new Map<string, Date>();
    for (const s of sales) {
      if (s.blNumber) blDateMap.set(s.blNumber, s.date);
    }
    console.log(`[q4-2026-volumes] Found ${blDateMap.size} matching sales in Sale (fallback)`);

    // 3) Parse une date depuis la colonne "Date d'expédition"
    //    (peut être un objet Date si cellDates:true, ou un string DD/MM/YYYY, ou un nombre série Excel)
    const parseDateCell = (raw: unknown): Date | null => {
      if (raw == null) return null;
      if (raw instanceof Date) {
        if (!isNaN(raw.getTime())) return raw;
        return null;
      }
      if (typeof raw === 'number') {
        // Série Excel (jours depuis 1899-12-30)
        const d = new Date(Date.UTC(1899, 11, 30) + raw * 86400000);
        if (!isNaN(d.getTime())) return d;
        return null;
      }
      if (typeof raw === 'string') {
        const t = raw.trim();
        // DD/MM/YYYY ou DD-MM-YYYY
        const m = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
        if (m) {
          const d = parseInt(m[1], 10);
          const mo = parseInt(m[2], 10);
          let y = parseInt(m[3], 10);
          if (y < 100) y += 2000;
          const dt = new Date(y, mo - 1, d);
          if (!isNaN(dt.getTime())) return dt;
        }
        // Fallback Date.parse
        const dt = new Date(t);
        if (!isNaN(dt.getTime())) return dt;
      }
      return null;
    };

    // 4) Supprime les VolumeSale existants pour les mois spécifiés (deleteMonths)
    //    Si deleteMonths vide, supprime août+sept+oct 2026 (comportement par défaut).
    const monthsToDelete = deleteMonths.length > 0 ? deleteMonths : [8, 9, 10];
    const deleted = await db.volumeSale.deleteMany({
      where: {
        AND: [
          { year: forceYear },
          { month: { in: monthsToDelete } },
        ],
      },
    });
    console.log(`[q4-2026-volumes] Deleted ${deleted.count} existing VolumeSale for ${forceYear} months ${JSON.stringify(monthsToDelete)}`);

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
    let dateFromFile = 0;
    let dateFromSale = 0;
    let dateInferred = 0;

    for (const row of dataRows) {
      const refRaw = row[colRef];
      if (refRaw == null) { skipped++; continue; }
      const refStr = String(refRaw).trim();
      if (!refStr) { skipped++; continue; }

      // Filtre par numéro de BL minimum (ex: ne garder que les BL >= 26000600 pour novembre)
      if (filterBlMin) {
        const m = refStr.match(/^(\d{8,})$/);
        const num = m ? parseInt(m[1], 10) : 0;
        if (num < filterBlMin) { skipped++; continue; }
      }

      const clientStr = String(row[colClient] ?? '').trim();
      const productLabel = String(row[colProduit] ?? '').trim();
      if (!clientStr || !productLabel) { skipped++; continue; }

      // Date — priorité 1: forceMonth (si fourni, fichier sans colonne Date)
      //          priorité 2: colonne "Date d'expédition" du fichier
      //          priorité 3: date du BL depuis Sale
      //          priorité 4: inférée (15 sept si BL<26000600, sinon 15 oct)
      let date: Date | null = null;
      if (forceMonth) {
        // Toutes les lignes au 15 du mois forcé (mi-mois = approximation)
        date = new Date(forceYear, forceMonth - 1, 15);
        dateInferred++;
      } else {
        if (colDate) {
          date = parseDateCell(row[colDate]);
          if (date) dateFromFile++;
        }
        if (!date && blDateMap.has(refStr)) {
          date = blDateMap.get(refStr)!;
          dateFromSale++;
        }
        if (!date) {
          // Inférence: BL < 26000600 → sept 2026, sinon oct 2026
          const m = refStr.match(/^(\d{8,})$/);
          const num = m ? parseInt(m[1], 10) : 0;
          if (num >= 26000600) date = new Date(2026, 9, 15); // 15 oct 2026
          else date = new Date(2026, 8, 15); // 15 sept 2026
          dateInferred++;
        }
      }

      // Rejette les dates hors plage plausible (avant 2024)
      if (date.getFullYear() < 2024) { skipped++; continue; }

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

    console.log(`[q4-2026-volumes] Prepared ${toInsert.length} rows (skipped ${skipped}, dates: file=${dateFromFile}, sale=${dateFromSale}, inferred=${dateInferred})`);

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
        datesFromFile: dateFromFile,
        datesFromSale: dateFromSale,
        datesInferred: dateInferred,
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
