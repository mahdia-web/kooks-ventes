import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { db } from '@/lib/db';
import { normalizeEnseigne, similarityScore } from '@/lib/normalize-enseigne';

export const maxDuration = 60;

/**
 * POST /api/volumes/import
 * Body: multipart/form-data avec un champ "file" (Excel)
 *
 * Importe les données de volume (colis) depuis un fichier Excel.
 *
 * Colonnes détectées automatiquement (avec variantes) :
 *   - Date : Date, date, DATE
 *   - Client : Client, client, Enseigne, Magasin
 *   - Produit : Libellé, Libelle, Produit, Référence, Ref, Description
 *   - Quantité : Qté, Qté, qte, Quantité, Colis, Nb. Colis, Nb Colis, quantity
 *   - PU : PU HT, PU, Prix unitaire, unitPrice
 *   - Facture : Facture, N° Facture, Ref Facture, Référence
 *
 * Liaison intelligente : utilise resolveCanonicalName pour faire le lien
 * avec les enseignes existantes en base (évite les doublons).
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ ok: false, error: 'Aucun fichier reçu' }, { status: 400 });
    }

    console.log(`[volumes/import] File received: ${file.name} (${file.size} bytes)`);

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    console.log(`[volumes/import] Sheets: ${workbook.SheetNames.join(', ')}`);

    // Prend la première feuille (ou cherche DÉTAIL FACTURES)
    let sheetName = workbook.SheetNames.find(n =>
      n.toUpperCase().includes('DÉTAIL') || n.toUpperCase().includes('DETAIL') || n.toUpperCase().includes('FACTURE')
    );
    if (!sheetName) sheetName = workbook.SheetNames[0];
    console.log(`[volumes/import] Using sheet: ${sheetName}`);

    const sheet = workbook.Sheets[sheetName];

    // Détecte la ligne d'en-têtes (scanne les 5 premières lignes)
    let headerRowIdx = 0;
    let headers: string[] = [];
    for (let tryRow = 0; tryRow < 5; tryRow++) {
      try {
        const testRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
          raw: false, defval: null, range: tryRow,
        });
        if (testRows.length === 0) continue;
        const testHeaders = Object.keys(testRows[0]);
        const hasClient = testHeaders.some(h => /client|enseigne|magasin/i.test(h));
        const hasQty = testHeaders.some(h => /qt|colis|quantit|nb/i.test(h));
        if (hasClient && hasQty) {
          headerRowIdx = tryRow;
          headers = testHeaders;
          break;
        }
      } catch { continue; }
    }

    if (headers.length === 0) {
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: true, defval: null });
      headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    }

    console.log(`[volumes/import] Headers detected: ${headers.join(', ')}`);

    // Lit les données avec la bonne ligne d'en-têtes
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      raw: true, defval: null, range: headerRowIdx,
    });

    // Helper: trouve une colonne par pattern
    const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[''`]/g, '').trim();
    const findCol = (patterns: string[]): string | null => {
      for (const p of patterns) {
        const pl = normalize(p);
        const found = headers.find(h => {
          const hl = normalize(h);
          return hl === pl || hl.includes(pl) || pl.includes(hl);
        });
        if (found) return found;
      }
      return null;
    };

    const usedCols = new Set<string>();
    const colDate = findCol(['Date', 'date']);
    if (colDate) usedCols.add(colDate);
    const colClient = findCol(['Client', 'Enseigne', 'Magasin', 'client']) ?? headers.find(h => /client|enseigne|magasin/i.test(h));
    if (colClient) usedCols.add(colClient);
    const colProduit = findCol(['Libellé', 'Libelle', 'Produit', 'Description', 'Référence', 'Ref', 'libelle']);
    const colQte = findCol(['Qté', 'Qté', 'qte', 'Quantité', 'Colis', 'Nb. Colis', 'Nb Colis', 'quantity', 'nb']);
    if (colQte) usedCols.add(colQte);
    const colPU = findCol(['PU HT', 'PU', 'Prix unitaire', 'unitPrice', 'pu']);
    const colFacture = findCol(['Facture', 'N° Facture', 'Ref Facture', 'Référence', 'Reference', 'facture']);

    console.log(`[volumes/import] Columns mapped: date=${colDate}, client=${colClient}, produit=${colProduit}, qte=${colQte}, pu=${colPU}, facture=${colFacture}`);

    if (!colClient || !colQte) {
      return NextResponse.json({
        ok: false,
        error: `Colonnes manquantes. Attendu: Client (${colClient ? 'OK' : 'MANQUANT'}), Quantité/Colis (${colQte ? 'OK' : 'MANQUANT'}). Colonnes détectées: ${headers.join(', ')}`,
        detectedColumns: headers,
      }, { status: 400 });
    }

    // Charge les enseignes existantes pour la résolution canonique
    const existingEnseignes = await db.enseigne.findMany({ select: { name: true } });
    const existingNames = existingEnseignes.map(e => e.name);
    const existingNormMap = new Map<string, string>();
    for (const name of existingNames) {
      const n = normalizeEnseigne(name);
      if (n && !existingNormMap.has(n)) existingNormMap.set(n, name);
    }

    const resolveCanonical = (incoming: string): string => {
      if (!incoming?.trim()) return incoming;
      const trimmed = incoming.trim();
      const lower = trimmed.toLowerCase();
      // Exact
      const exact = existingNames.find(n => n.toLowerCase() === lower);
      if (exact) return exact;
      // Normalized
      const norm = normalizeEnseigne(trimmed);
      if (norm) {
        const match = existingNormMap.get(norm);
        if (match) return match;
      }
      // Similar
      let best: string | null = null;
      let bestScore = 0;
      for (const n of existingNames) {
        const s = similarityScore(trimmed, n);
        if (s > bestScore) { bestScore = s; best = n; }
      }
      if (best && bestScore >= 0.85) return best;
      return trimmed;
    };

    const PARFUM_KEYWORDS = ['ORIGINAL', 'PEANUT BUTTER', 'CRISPY CHOCO', 'CARAMEL PECAN', 'SPECULOOS', 'COCO', 'SPEC'];
    const FORMAT_KEYWORDS: Array<[string, string]> = [
      ['LOT 2', 'Lot de 2'], ['LOT DE 2', 'Lot de 2'],
      ['BOX 9', 'Box de 9'], ['BOX DE 9', 'Box de 9'],
      ['PAV 8', 'Indiv PAV 8'], ['PAV8', 'Indiv PAV 8'],
      ['FOURO', 'Indiv Fouro'], ['INDIV', 'Indiv Fouro'],
      ['BARQUETTE PCB 6', 'Lot de 2'], ['COLIS PCB 8', 'Indiv PAV 8'],
    ];

    const toInsert: Array<{
      date: Date; month: number; year: number; enseigne: string;
      productLabel: string; parfum: string | null; format: string | null;
      quantity: number; unitPrice: number | null; factureRef: string | null;
    }> = [];

    let skipped = 0;
    let resolvedCount = 0;

    for (const row of rows) {
      const dateRaw = colDate ? row[colDate] : null;
      const clientRaw = colClient ? row[colClient] : '';
      const produitRaw = colProduit ? row[colProduit] : '';
      const qteRaw = colQte ? row[colQte] : null;
      const puRaw = colPU ? row[colPU] : null;
      const factureRaw = colFacture ? row[colFacture] : null;

      // Parse date
      let date: Date | null = null;
      if (dateRaw instanceof Date) date = dateRaw;
      else if (typeof dateRaw === 'number') {
        const e = new Date(Date.UTC(1899, 11, 30));
        date = new Date(e.getTime() + dateRaw * 86400000);
      } else if (typeof dateRaw === 'string' && dateRaw.trim()) {
        const t = dateRaw.trim();
        const m = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
        if (m) {
          const d = parseInt(m[1], 10);
          const mo = parseInt(m[2], 10);
          let y = parseInt(m[3], 10);
          if (y < 100) y += 2000;
          date = new Date(y, mo - 1, d);
        } else {
          const d = new Date(t);
          if (!isNaN(d.getTime())) date = d;
        }
      }
      if (!date || isNaN(date.getTime()) || date.getFullYear() < 2020) { skipped++; continue; }

      // Parse quantity
      let quantity: number;
      if (typeof qteRaw === 'number') quantity = Math.floor(qteRaw);
      else if (typeof qteRaw === 'string') quantity = Math.floor(parseFloat(qteRaw.replace(/[^\d.-]/g, '')) || 0);
      else quantity = 0;
      if (quantity <= 0) { skipped++; continue; }

      // Client → resolve canonical
      const clientStr = String(clientRaw ?? '').trim();
      if (!clientStr) { skipped++; continue; }
      const enseigne = resolveCanonical(clientStr);
      if (enseigne !== clientStr) resolvedCount++;

      // Produit
      const productLabel = String(produitRaw ?? '').trim();
      if (!productLabel) { skipped++; continue; }

      // Parfum
      const labelUpper = productLabel.toUpperCase();
      let parfum: string | null = null;
      for (const kw of PARFUM_KEYWORDS) {
        if (labelUpper.includes(kw)) {
          parfum = kw === 'SPEC' && !labelUpper.includes('SPECULOOS') ? 'Speculoos' : kw.charAt(0) + kw.slice(1).toLowerCase();
          break;
        }
      }

      // Format
      let format: string | null = null;
      for (const [kw, label] of FORMAT_KEYWORDS) {
        if (labelUpper.includes(kw)) { format = label; break; }
      }

      // PU
      let unitPrice: number | null = null;
      if (typeof puRaw === 'number') unitPrice = puRaw;
      else if (typeof puRaw === 'string') {
        const n = parseFloat(String(puRaw).replace(/\s/g, '').replace(',', '.'));
        if (!isNaN(n)) unitPrice = n;
      }

      // Facture
      const factureRef = factureRaw ? String(factureRaw).trim() : null;

      toInsert.push({
        date, month: date.getMonth() + 1, year: date.getFullYear(),
        enseigne, productLabel, parfum, format, quantity, unitPrice,
        factureRef,
      });
    }

    console.log(`[volumes/import] Prepared ${toInsert.length} rows (${skipped} skipped, ${resolvedCount} resolved to canonical)`);

    // Insertion en lots
    const BATCH_SIZE = 500;
    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE);
      try {
        const result = await db.volumeSale.createMany({ data: batch, skipDuplicates: true });
        inserted += result.count;
      } catch (e) {
        console.error(`[volumes/import] Batch ${i} failed, fallback 1-by-1:`, e);
        for (const item of batch) {
          try { await db.volumeSale.create({ data: item }); inserted++; } catch { skipped++; }
        }
      }
    }

    console.log(`[volumes/import] Done: ${inserted} inserted, ${skipped} skipped`);

    return NextResponse.json({
      ok: true,
      result: { inserted, skipped, total: rows.length },
      detail: `${inserted} ligne(s) importée(s), ${skipped} ignorée(s) sur ${rows.length} total`,
      sheetUsed: sheetName,
      detectedColumns: headers,
      columnMapping: { date: colDate, client: colClient, produit: colProduit, qte: colQte, pu: colPU, facture: colFacture },
      resolvedCount,
    });
  } catch (e) {
    console.error('[volumes/import] Error:', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur serveur' },
      { status: 500 }
    );
  }
}
