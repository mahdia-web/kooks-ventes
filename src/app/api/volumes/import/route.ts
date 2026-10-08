import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { db } from '@/lib/db';

/**
 * POST /api/volumes/import
 * Body: multipart/form-data avec un champ "file" (Excel)
 *
 * Importe les données de volume depuis la feuille "DÉTAIL FACTURES"
 * du fichier "Analyse Factures Clients".
 *
 * Colonnes attendues: Date, Facture, Code client, Client, Référence, Libellé, Qté, PU HT, Remise %, Montant HT payé
 *
 * Le CA n'est PAS importé (déjà dans Sale). On importe juste les quantités/volumes.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ ok: false, error: 'Aucun fichier reçu' }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });

    // Cherche la feuille DÉTAIL FACTURES
    let sheetName = workbook.SheetNames.find(n => n.toUpperCase().includes('DÉTAIL') || n.toUpperCase().includes('DETAIL'));
    if (!sheetName) sheetName = workbook.SheetNames[0];

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: true, defval: null });

    // Parsing et insertion en lots (batch)
    const PARFUM_KEYWORDS = ['ORIGINAL', 'PEANUT BUTTER', 'CRISPY CHOCO', 'CARAMEL PECAN', 'SPECULOOS', 'COCO', 'SPEC'];
    const FORMAT_KEYWORDS = ['LOT 2', 'LOT DE 2', 'BOX 9', 'BOX DE 9', 'PAV 8', 'FOURO', 'INDIV'];

    const toInsert: Array<{
      date: Date; month: number; year: number; enseigne: string;
      productLabel: string; parfum: string | null; format: string | null;
      quantity: number; unitPrice: number | null; factureRef: string | null;
    }> = [];

    let skipped = 0;

    for (const row of rows) {
      const dateRaw = row['Date'] ?? row['date'];
      const facture = row['Facture'] ?? row['facture'];
      const client = row['Client'] ?? row['client'] ?? '';
      const libelle = row['Libellé'] ?? row['Libelle'] ?? row['libellé'] ?? '';
      const qteRaw = row['Qté'] ?? row['Qté'] ?? row['qte'] ?? row['Quantité'];
      const puRaw = row['PU HT'] ?? row['pu ht'];

      // Parse date
      let date: Date | null = null;
      if (dateRaw instanceof Date) { date = dateRaw; }
      else if (typeof dateRaw === 'number') { const e = new Date(Date.UTC(1899, 11, 30)); date = new Date(e.getTime() + dateRaw * 86400000); }
      else if (typeof dateRaw === 'string' && dateRaw.trim()) { const d = new Date(dateRaw.trim()); if (!isNaN(d.getTime())) date = d; }
      if (!date || isNaN(date.getTime()) || date.getFullYear() < 2020) { skipped++; continue; }

      let quantity: number;
      if (typeof qteRaw === 'number') quantity = Math.floor(qteRaw);
      else if (typeof qteRaw === 'string') quantity = Math.floor(parseFloat(qteRaw.replace(/[^\d.-]/g, '')) || 0);
      else quantity = 0;
      if (quantity <= 0) { skipped++; continue; }

      const enseigne = String(client).trim();
      if (!enseigne) { skipped++; continue; }
      const productLabel = String(libelle).trim();
      if (!productLabel) { skipped++; continue; }

      const labelUpper = productLabel.toUpperCase();
      let parfum: string | null = null;
      for (const kw of PARFUM_KEYWORDS) {
        if (labelUpper.includes(kw)) {
          parfum = kw === 'SPEC' && !labelUpper.includes('SPECULOOS') ? 'Speculoos' : kw.charAt(0) + kw.slice(1).toLowerCase();
          break;
        }
      }
      let format: string | null = null;
      if (labelUpper.includes('LOT 2') || labelUpper.includes('LOT DE 2')) format = 'Lot de 2';
      else if (labelUpper.includes('BOX 9') || labelUpper.includes('BOX DE 9')) format = 'Box de 9';
      else if (labelUpper.includes('PAV 8') || labelUpper.includes('PAV8')) format = 'Indiv PAV 8';
      else if (labelUpper.includes('FOURO')) format = 'Indiv Fouro';

      let unitPrice: number | null = null;
      if (typeof puRaw === 'number') unitPrice = puRaw;
      else if (typeof puRaw === 'string') { const n = parseFloat(puRaw.replace(/\s/g, '').replace(',', '.')); if (!isNaN(n)) unitPrice = n; }

      toInsert.push({
        date, month: date.getMonth() + 1, year: date.getFullYear(),
        enseigne, productLabel, parfum, format, quantity, unitPrice,
        factureRef: facture ? String(facture) : null,
      });
    }

    // Insertion en lots de 500
    const BATCH_SIZE = 500;
    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE);
      try {
        const result = await db.volumeSale.createMany({ data: batch });
        inserted += result.count;
      } catch (e) {
        // Si échec, essaye ligne par ligne pour le batch
        for (const item of batch) {
          try { await db.volumeSale.create({ data: item }); inserted++; } catch { skipped++; }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      result: { inserted, skipped, total: rows.length },
      detail: `${inserted} ligne(s) importée(s), ${skipped} ignorée(s) sur ${rows.length} total`,
      sheetUsed: sheetName,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    );
  }
}
