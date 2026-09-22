import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { db } from '@/lib/db';
import { setCurrentPeriod } from '@/lib/dashboard-service';
import type { ImportResult } from '@/lib/dashboard-types';

// POST /api/import
// Body: multipart/form-data avec un champ "file" contenant le fichier Excel
// Le fichier est le SUIVI_AGENTS_FINAL_V2.xlsx mis à jour (ou un fichier mensuel plus simple)
// La fonction insère uniquement les nouvelles ventes (basé sur le N° BL unique)
export async function POST(req: NextRequest) {
  console.log('=== POST /api/import ===');
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: 'Aucun fichier reçu.' },
        { status: 400 }
      );
    }

    console.log(`Fichier reçu : ${file.name} (${file.size} octets, type: ${file.type})`);

    let buffer: ArrayBuffer;
    try {
      buffer = await file.arrayBuffer();
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: 'Impossible de lire le fichier. Vérifiez que le fichier n\'est pas corrompu.' },
        { status: 400 }
      );
    }

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        { ok: false, error: `Format Excel non reconnu. Détails : ${msg}. Formats supportés : .xlsx, .xls, .ods, .csv` },
        { status: 400 }
      );
    }

    console.log(`Feuilles détectées : ${workbook.SheetNames.join(', ')}`);

    // Cherche la feuille VENTES, sinon prend la première qui ressemble à des ventes
    let sheetName: string | null = null;
    if (workbook.SheetNames.includes('VENTES')) {
      sheetName = 'VENTES';
    } else {
      // Cherche une feuille dont le nom contient VENTES ou VENTE
      sheetName = workbook.SheetNames.find((n) =>
        /vente/i.test(n)
      ) ?? null;
      // Sinon prend la première feuille
      if (!sheetName) sheetName = workbook.SheetNames[0] ?? null;
    }

    if (!sheetName) {
      return NextResponse.json(
        { ok: false, error: `Aucune feuille trouvée. Feuilles disponibles : ${workbook.SheetNames.join(', ')}` },
        { status: 400 }
      );
    }

    console.log(`Feuille utilisée : ${sheetName}`);
    const sheet = workbook.Sheets[sheetName];

    // Détecte où sont les en-têtes en scannant les 5 premières lignes
    let headerRowIdx = 0;
    let headers: string[] = [];
    for (let tryRow = 0; tryRow < 5; tryRow++) {
      // sheet_to_json avec range:tryRow prend cette ligne comme en-têtes
      try {
        const testRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
          raw: true,
          defval: null,
          range: tryRow,
        });
        if (testRows.length === 0) continue;
        const testHeaders = Object.keys(testRows[0]).map((h) => h.toLowerCase());
        // Cherche DATE + (BL ou ENSEIGNE)
        const hasDate = testHeaders.some((h) => h.includes('date'));
        const hasBlOrEnseigne = testHeaders.some((h) =>
          h.includes('bl') || h.includes('enseigne') || h.includes('n°')
        );
        if (hasDate && hasBlOrEnseigne) {
          headerRowIdx = tryRow;
          headers = Object.keys(testRows[0]);
          console.log(`En-têtes détectés à la ligne ${tryRow + 1} : ${headers.join(', ')}`);
          break;
        }
      } catch {
        continue;
      }
    }

    if (headers.length === 0) {
      // Tente quand même avec range 0 (première ligne)
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        raw: true,
        defval: null,
      });
      if (rows.length === 0) {
        return NextResponse.json(
          { ok: false, error: `La feuille "${sheetName}" ne contient aucune donnée.` },
          { status: 400 }
        );
      }
      headers = Object.keys(rows[0]);
      headerRowIdx = 0;
      console.log(`En-têtes par défaut (ligne 1) : ${headers.join(', ')}`);
    }

    // Re-lit les données en partant de la bonne ligne d'en-têtes
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      raw: true,
      defval: null,
      range: headerRowIdx,
    });

    console.log(`Nombre de lignes lues : ${rows.length}`);

    if (rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Aucune donnée trouvée dans la feuille.' },
        { status: 400 }
      );
    }

    // Mapping flexible des colonnes
    const findCol = (patterns: string[]): string | null => {
      for (const p of patterns) {
        const pl = p.toLowerCase();
        const found = headers.find((h) => {
          const hl = h.toLowerCase().trim();
          return hl === pl || hl.includes(pl);
        });
        if (found) return found;
      }
      return null;
    };

    const colDate = findCol(['DATE']);
    const colBl = findCol(['N° BL', 'BL', 'NUMERO BL', 'N BL', 'BON']);
    const colEnseigne = findCol(['ENSEIGNE', 'CLIENT']);
    const colType = findCol(['TYPE']);
    const colAgent = findCol(['AGENT', 'COMMERCIAL', 'REPRESENTANT']);
    const colHT = findCol(['HT']);
    const colTTC = findCol(['TTC']);
    const colTaux = findCol(['TAUX']);
    const colCommission = findCol(['COMMISSION']);
    const colMois = findCol(['MOIS']);
    const colAnnee = findCol(['ANN']);

    console.log('Colonnes mappées :', {
      date: colDate, bl: colBl, enseigne: colEnseigne, type: colType,
      agent: colAgent, ht: colHT, ttc: colTTC, taux: colTaux,
      commission: colCommission, mois: colMois, annee: colAnnee,
    });

    if (!colDate) {
      return NextResponse.json(
        {
          ok: false,
          error: `Colonne "DATE" introuvable. Colonnes détectées : ${headers.join(', ')}`,
        },
        { status: 400 }
      );
    }

    if (!colBl) {
      return NextResponse.json(
        {
          ok: false,
          error: `Colonne "N° BL" introuvable. Colonnes détectées : ${headers.join(', ')}`,
        },
        { status: 400 }
      );
    }

    // Récupère les N° BL déjà en base
    const existingBl = new Set(
      (await db.sale.findMany({ select: { blNumber: true } })).map((s) => s.blNumber)
    );
    console.log(`N° BL déjà en base : ${existingBl.size}`);

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
    let skippedNoDate = 0;
    let skippedNoBl = 0;
    let skippedDuplicate = 0;
    let skippedInvalid = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const blRaw = colBl ? row[colBl] : null;
      const dateRaw = colDate ? row[colDate] : null;

      // Skip lignes vides ou sans N° BL
      if (!blRaw) {
        skippedNoBl++;
        continue;
      }

      const blNumber = String(blRaw).trim();
      if (!blNumber) {
        skippedNoBl++;
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
      } else if (typeof dateRaw === 'string' && dateRaw.trim()) {
        // Tente plusieurs formats : DD/MM/YYYY, YYYY-MM-DD, etc.
        const trimmed = dateRaw.trim();
        const dmy = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
        if (dmy) {
          const day = parseInt(dmy[1], 10);
          const month = parseInt(dmy[2], 10);
          let year = parseInt(dmy[3], 10);
          if (year < 100) year += 2000;
          date = new Date(year, month - 1, day);
        } else {
          const parsed = new Date(trimmed);
          if (isNaN(parsed.getTime())) {
            if (errors.length < 5) {
              errors.push(`Ligne ${i + headerRowIdx + 2}: date invalide "${dateRaw}"`);
            }
            skippedNoDate++;
            continue;
          }
          date = parsed;
        }
      } else {
        // Pas de date
        skippedNoDate++;
        continue;
      }

      // Vérifie que la date est valide (au moins l'année 2020+)
      if (isNaN(date.getTime()) || date.getFullYear() < 2020) {
        skippedInvalid++;
        continue;
      }

      // Si déjà en base ou déjà dans le batch courant → on skip
      if (existingBl.has(blNumber)) {
        skippedDuplicate++;
        continue;
      }

      // Vérifie aussi les doublons intra-batch
      if (toInsert.some((v) => v.blNumber === blNumber)) {
        skippedDuplicate++;
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

      // Prépare l'enseigne de référence
      if (!newEnseignes.has(enseigne) && enseigne !== 'Inconnu') {
        newEnseignes.set(enseigne, { name: enseigne, type, agent });
      }
    }

    console.log(`Bilan pré-import : ${toInsert.length} à insérer, doublons=${skippedDuplicate}, sans BL=${skippedNoBl}, sans date=${skippedNoDate}, invalides=${skippedInvalid}`);

    // Insère en masse (SQLite ne supporte pas skipDuplicates dans createMany,
    // mais on a déjà filtré les doublons existants via existingBl)
    let inserted = 0;
    if (toInsert.length > 0) {
      try {
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
        });
        inserted = result.count;
        console.log(`createMany : ${inserted} ventes insérées`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('Erreur createMany :', msg);
        // Si erreur de doublon, tente l'insertion individuelle
        if (msg.includes('unique') || msg.includes('UNIQUE')) {
          console.log('Tentative d\'insertion individuelle...');
          for (const v of toInsert) {
            try {
              await db.sale.create({ data: v });
              inserted++;
            } catch (e2) {
              // Doublon : ignore
            }
          }
          console.log(`Insertion individuelle : ${inserted} ventes insérées`);
        } else {
          return NextResponse.json(
            { ok: false, error: `Erreur base de données : ${msg}` },
            { status: 500 }
          );
        }
      }
    }

    // Insère les nouvelles enseignes (sans skipDuplicates)
    if (newEnseignes.size > 0) {
      for (const e of Array.from(newEnseignes.values())) {
        try {
          await db.enseigne.create({ data: e });
        } catch (e2) {
          // Doublon : ignore
        }
      }
    }

    // Met à jour la période courante si on a importé
    if (inserted > 0) {
      const lastDate = toInsert.reduce((max, v) =>
        v.date > max ? v.date : max, toInsert[0].date);
      const lastYear = lastDate.getFullYear();
      const lastMonth = lastDate.getMonth() + 1;
      await setCurrentPeriod(lastYear, lastMonth);
      console.log(`Période courante mise à jour : ${lastMonth}/${lastYear}`);
    }

    const totalSkipped = skippedNoDate + skippedNoBl + skippedDuplicate + skippedInvalid;
    const result: ImportResult = {
      inserted,
      skipped: totalSkipped,
      errors,
      total: toInsert.length,
    };

    // Construit un message détaillé
    const detail = [
      `${inserted} nouvelle(s) vente(s) ajoutée(s)`,
      `${skippedDuplicate} doublon(s) ignoré(s)`,
      skippedNoBl > 0 ? `${skippedNoBl} ligne(s) sans N° BL` : null,
      skippedNoDate > 0 ? `${skippedNoDate} ligne(s) sans date valide` : null,
      skippedInvalid > 0 ? `${skippedInvalid} ligne(s) invalides` : null,
    ].filter(Boolean);

    console.log(`Import terminé : ${detail.join(', ')}`);

    return NextResponse.json({
      ok: true,
      result,
      detail: detail.join(', '),
    });
  } catch (e) {
    console.error('Erreur non gérée /api/import:', e);
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : 'Erreur serveur inattendue',
      },
      { status: 500 }
    );
  }
}
