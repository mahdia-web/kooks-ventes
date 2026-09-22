import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { db } from '@/lib/db';
import { getCurrentPeriod, setCurrentPeriod } from '@/lib/dashboard-service';
import type { ImportResult } from '@/lib/dashboard-types';

// POST /api/import
// Body: multipart/form-data avec un champ "file" contenant le fichier Excel
// Le fichier est le SUIVI_AGENTS_FINAL_V2.xlsx mis à jour
// La fonction insère uniquement les nouvelles ventes (basé sur le N° BL unique)
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: 'Fichier manquant' },
        { status: 400 }
      );
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });

    // Vérifie que la feuille VENTES existe
    if (!workbook.SheetNames.includes('VENTES')) {
      return NextResponse.json(
        { ok: false, error: `Feuille VENTES non trouvée. Feuilles disponibles : ${workbook.SheetNames.join(', ')}` },
        { status: 400 }
      );
    }

    const sheet = workbook.Sheets['VENTES'];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      raw: true,
      defval: null,
      range: 1, // Skip ligne 1 (légende couleurs), en-têtes en ligne 2
    });

    if (rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Aucune donnée dans la feuille VENTES' },
        { status: 400 }
      );
    }

    // Identifie les en-têtes réels
    const headers = Object.keys(rows[0]);
    console.log('En-têtes détectés :', headers);

    const findCol = (patterns: string[]): string | null => {
      for (const p of patterns) {
        const found = headers.find((h) => h.toLowerCase().includes(p.toLowerCase()));
        if (found) return found;
      }
      return null;
    };

    const colDate = findCol(['DATE']);
    const colBl = findCol(['BL', 'N°']);
    const colEnseigne = findCol(['ENSEIGNE']);
    const colType = findCol(['TYPE']);
    const colAgent = findCol(['AGENT']);
    const colHT = findCol(['HT']);
    const colTTC = findCol(['TTC']);
    const colTaux = findCol(['TAUX']);
    const colCommission = findCol(['COMMISSION']);
    const colMois = findCol(['MOIS']);
    const colAnnee = findCol(['ANN']);

    if (!colDate || !colBl) {
      return NextResponse.json(
        { ok: false, error: `Colonnes DATE et N° BL obligatoires. Trouvé : DATE=${colDate}, BL=${colBl}` },
        { status: 400 }
      );
    }

    // Récupère les N° BL déjà en base (pour détecter les doublons en masse)
    const existingBl = new Set(
      (await db.sale.findMany({ select: { blNumber: true } })).map((s) => s.blNumber)
    );

    // Récupère la liste des enseignes de référence
    const existingEnseignes = await db.enseigne.findMany();
    const enseigneMap = new Map(existingEnseignes.map((e) => [e.name, e]));

    // Prépare les ventes à insérer
    const toInsert: Array<{
      blNumber: string;
      date: Date;
      enseigne: string;
      type: string;
      agent: string;
      amountHT: number;
      amountTTC: number;
      rate: number;
      commission: number;
      month: number;
      year: number;
    }> = [];
    const newEnseignes = new Map<string, { name: string; type: string; agent: string }>();
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const blRaw = colBl ? row[colBl] : null;
      const dateRaw = colDate ? row[colDate] : null;

      // Skip lignes vides ou sans N° BL
      if (!blRaw || !dateRaw) {
        skipped++;
        continue;
      }

      const blNumber = String(blRaw).trim();
      if (!blNumber || !blNumber.startsWith('BDL')) {
        // Pas un vrai BL de vente
        skipped++;
        continue;
      }

      // Vérifie que la date est valide
      let date: Date;
      if (dateRaw instanceof Date) {
        date = dateRaw;
      } else if (typeof dateRaw === 'number') {
        // Numéro de série Excel
        const epoch = new Date(Date.UTC(1899, 11, 30));
        date = new Date(epoch.getTime() + dateRaw * 86400000);
      } else if (typeof dateRaw === 'string') {
        const parsed = new Date(dateRaw);
        if (isNaN(parsed.getTime())) {
          errors.push(`Ligne ${i + 2}: date invalide "${dateRaw}"`);
          skipped++;
          continue;
        }
        date = parsed;
      } else {
        skipped++;
        continue;
      }

      // Si déjà en base → on skip
      if (existingBl.has(blNumber)) {
        skipped++;
        continue;
      }

      // Normalise les autres champs
      const toNum = (v: unknown): number => {
        if (typeof v === 'number') return v;
        if (typeof v === 'string') {
          const cleaned = v.replace(/\s/g, '').replace(/€/g, '').replace(',', '.');
          const n = parseFloat(cleaned);
          return isNaN(n) ? 0 : n;
        }
        return 0;
      };

      const toStr = (v: unknown): string => (v ? String(v).trim() : '');

      const enseigne = colEnseigne ? toStr(row[colEnseigne]) : 'Inconnu';
      const type = colType ? toStr(row[colType]) || 'Direct' : 'Direct';
      const agent = colAgent ? toStr(row[colAgent]) || 'Inconnu' : 'Inconnu';
      const amountHT = colHT ? toNum(row[colHT]) : 0;
      const amountTTC = colTTC ? toNum(row[colTTC]) : 0;
      const rate = colTaux ? toNum(row[colTaux]) : (type === 'Direct' ? 0.07 : 0.05);
      const commission = colCommission ? toNum(row[colCommission]) : amountHT * rate;
      const month = colMois ? Math.floor(toNum(row[colMois])) || date.getMonth() + 1 : date.getMonth() + 1;
      const year = colAnnee ? Math.floor(toNum(row[colAnnee])) || date.getFullYear() : date.getFullYear();

      toInsert.push({
        blNumber, date, enseigne, type, agent,
        amountHT, amountTTC, rate, commission, month, year,
      });

      // Prépare aussi l'enseigne de référence si elle n'existe pas
      if (!enseigneMap.has(enseigne) && !newEnseignes.has(enseigne) && enseigne !== 'Inconnu') {
        newEnseignes.set(enseigne, { name: enseigne, type, agent });
      }
    }

    // Insère en masse les nouvelles ventes
    let inserted = 0;
    if (toInsert.length > 0) {
      const result = await db.sale.createMany({
        data: toInsert.map((v) => ({
          blNumber: v.blNumber,
          date: v.date,
          enseigne: v.enseigne,
          type: v.type,
          agent: v.agent,
          amountHT: v.amountHT,
          amountTTC: v.amountTTC,
          rate: v.rate,
          commission: v.commission,
          month: v.month,
          year: v.year,
        })),
        skipDuplicates: true,
      });
      inserted = result.count;
    }

    // Insère les nouvelles enseignes de référence
    if (newEnseignes.size > 0) {
      await db.enseigne.createMany({
        data: Array.from(newEnseignes.values()),
        skipDuplicates: true,
      });
    }

    // Met à jour la période courante en se basant sur la dernière vente importée
    if (toInsert.length > 0) {
      const lastDate = toInsert.reduce((max, v) =>
        v.date > max ? v.date : max, toInsert[0].date);
      const lastYear = lastDate.getFullYear();
      const lastMonth = lastDate.getMonth() + 1;
      await setCurrentPeriod(lastYear, lastMonth);
    }

    const result: ImportResult = {
      inserted,
      skipped,
      errors,
      total: toInsert.length,
    };

    console.log(`Import terminé : ${inserted} nouvelles ventes, ${skipped} ignorées`);

    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error('Erreur /api/import:', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur serveur' },
      { status: 500 }
    );
  }
}
