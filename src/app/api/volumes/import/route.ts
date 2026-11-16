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
    // Recherche en 3 passes pour éviter les faux positifs :
    //   1. Match exact (normalisé) — priorité maximale
    //   2. Header contient le pattern complet (header plus long) — ex: pattern "Colis" matche "Nb. Colis"
    //   3. Pattern contient le header (pattern plus long) — ex: pattern "Nb. Colis" matche "Colis"
    //      Uniquement si aucune colonne n'a été trouvée en passes 1 et 2.
    // Sans ça, pattern "Nb. Colis" matchait faussement "Colis" (car "nb colis" contient "colis").
    const findCol = (patterns: string[]): string | null => {
      // Pass 1: exact match
      for (const p of patterns) {
        const pl = normalize(p);
        const f = headers.find(h => normalize(h) === pl);
        if (f) return f;
      }
      // Pass 2: header contient le pattern (header plus long ou égal)
      for (const p of patterns) {
        const pl = normalize(p);
        const f = headers.find(h => { const hl = normalize(h); return hl.includes(pl); });
        if (f) return f;
      }
      // Pass 3: pattern contient le header (fallback — pattern plus long)
      for (const p of patterns) {
        const pl = normalize(p);
        const f = headers.find(h => { const hl = normalize(h); return pl.includes(hl); });
        if (f) return f;
      }
      return null;
    };

    const usedCols = new Set<string>();
    const colDate = findCol(['Date', 'date']);
    if (colDate) usedCols.add(colDate);
    const colClient = findCol(['Client', 'Enseigne', 'Magasin', 'client']) ?? headers.find(h => /client|enseigne|magasin/i.test(h));
    if (colClient) usedCols.add(colClient);
    const colProduit = findCol(['Libellé', 'Libelle', 'Produit', 'Description', 'Référence', 'Ref', 'libelle']);
    // IMPORTANT: 'Nb. Colis' (quantité) doit être essayé AVANT 'Colis' (format),
    // sinon findCol() matche la colonne format (BARQUETTE PCB 6) au lieu de la quantité.
    const colQte = findCol(['Nb. Colis', 'Nb Colis', 'Qté', 'Qté', 'qte', 'Quantité', 'quantity', 'nb colis', 'Colis']);
    if (colQte) usedCols.add(colQte);
    // Colonne 'Colis' (format/conditionnement) — distincte de 'Nb. Colis' (quantité)
    // L'ERP a une colonne 'Colis' avec des valeurs comme 'BARQUETTE PCB 6', 'COLIS PCB 4', 'COLIS PCB 8'
    // On la détecte APRES 'Nb. Colis' pour éviter le conflit (findCol 3-passes gère ça).
    const colFormat = findCol(['Colis', 'Format', 'Conditionnement', 'Packaging']);
    const colPU = findCol(['PU HT', 'PU', 'Prix unitaire', 'unitPrice', 'pu']);
    const colFacture = findCol(['Facture', 'N° Facture', 'Ref Facture', 'Référence', 'Reference', 'facture']);
    // Colonne 'Pièces' (nombre de pots/unités) — pour calcul alternatif des pots
    const colPieces = findCol(['Pièces', 'Pieces', 'Nb Pièces', 'Nb. Pièces', 'pots']);

    console.log(`[volumes/import] Columns mapped: date=${colDate}, client=${colClient}, produit=${colProduit}, qte=${colQte}, format=${colFormat}, pieces=${colPieces}, pu=${colPU}, facture=${colFacture}`);

    // Date par défaut : si le fichier n'a pas de colonne Date (ex: export ERP qui
    // ne contient que des numéros de BL séquentiels), on utilise defaultDate
    // passée en formData, sinon la date du jour. Toutes les lignes auront cette
    // date — l'utilisateur peut re-importer avec une autre date si besoin.
    const defaultDateStr = String(formData.get('defaultDate') ?? '');
    let defaultDate: Date | null = null;
    if (defaultDateStr) {
      const m = defaultDateStr.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
      if (m) {
        const d = parseInt(m[1], 10);
        const mo = parseInt(m[2], 10);
        let y = parseInt(m[3], 10);
        if (y < 100) y += 2000;
        defaultDate = new Date(y, mo - 1, d);
      }
    }
    if (!defaultDate) defaultDate = new Date();
    const hasDateColumn = !!colDate;
    console.log(`[volumes/import] hasDateColumn=${hasDateColumn}, defaultDate=${defaultDate.toISOString().split('T')[0]}`);

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
    // Format détecté depuis le libellé produit (fallback si pas de colonne 'Colis')
    const FORMAT_KEYWORDS: Array<[string, string]> = [
      ['LOT 2', 'Lot de 2'], ['LOT DE 2', 'Lot de 2'],
      ['BOX 9', 'Box de 9'], ['BOX DE 9', 'Box de 9'],
      ['PAV 8', 'Indiv PAV 8'], ['PAV8', 'Indiv PAV 8'],
      ['FOURO', 'Indiv Fouro'], ['INDIV', 'Indiv Fouro'],
      ['BARQUETTE PCB 6', 'Lot de 2'], ['COLIS PCB 8', 'Indiv PAV 8'],
      // Patterns ERP : "X2 BQ", "X1 PAV", "ETUI X9"
      ['X2 BQ', 'Lot de 2'], ['X1 PAV', 'Indiv PAV 8'], ['ETUI X9', 'Box de 9'],
    ];
    // Mapping direct valeur colonne 'Colis' (format ERP) → nom canonique
    // BARQUETTE PCB 6 = Lot de 2 (6 pots/colis), COLIS PCB 4 = Box de 9 (4 colis... non, 4 pots/colis vérifié),
    // COLIS PCB 8 = Indiv PAV 8 (8 pots/colis)
    // Vérifié depuis le fichier ERP : BARQUETTE=6p/colis, COLIS PCB 4=4p/colis, COLIS PCB 8=8p/colis
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
    let resolvedCount = 0;

    for (const row of rows) {
      const dateRaw = colDate ? row[colDate] : null;
      const clientRaw = colClient ? row[colClient] : '';
      const produitRaw = colProduit ? row[colProduit] : '';
      const qteRaw = colQte ? row[colQte] : null;
      const puRaw = colPU ? row[colPU] : null;
      const factureRaw = colFacture ? row[colFacture] : null;

      // Parse date — si pas de colonne date, utilise defaultDate (configurable)
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
      // Fallback: pas de colonne date ou date invalide → defaultDate
      if ((!date || isNaN(date.getTime()) || date.getFullYear() < 2020) && defaultDate) {
        date = defaultDate;
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

      // Format — priorité 1 : valeur de la colonne 'Colis' (format ERP, ex: 'BARQUETTE PCB 6')
      //          priorité 2 : détection depuis le libellé produit (FORMAT_KEYWORDS)
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
      columnMapping: { date: colDate, client: colClient, produit: colProduit, qte: colQte, format: colFormat, pieces: colPieces, pu: colPU, facture: colFacture },
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
