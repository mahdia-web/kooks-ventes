import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { db } from '@/lib/db';
import { setCurrentPeriod } from '@/lib/dashboard-service';

// POST /api/import
// Body: multipart/form-data avec un champ "file" (Excel) et optionnellement "mapping" (JSON string)
// Le fichier peut être SUIVI_AGENTS_FINAL_V2.xlsx complet OU un fichier mensuel du nouvel ERP sans N° BL.
// Détection automatique des colonnes + mapping utilisateur optionnel.
export async function POST(req: NextRequest) {
  console.log('=== POST /api/import ===');
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const mappingRaw = formData.get('mapping') as string | null;
    const detectOnly = formData.get('detectOnly') === 'true';

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: 'Aucun fichier reçu.' },
        { status: 400 }
      );
    }

    console.log(`Fichier reçu : ${file.name} (${file.size} octets) detectOnly=${detectOnly}`);

    let buffer: ArrayBuffer;
    try {
      buffer = await file.arrayBuffer();
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Impossible de lire le fichier. Vérifiez qu\'il n\'est pas corrompu.' },
        { status: 400 }
      );
    }

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        { ok: false, error: `Format Excel non reconnu : ${msg}` },
        { status: 400 }
      );
    }

    console.log(`Feuilles détectées : ${workbook.SheetNames.join(', ')}`);

    // Cherche la feuille VENTES, sinon une feuille contenant "vente", sinon la 1ère
    let sheetName: string = workbook.SheetNames[0] ?? '';
    if (workbook.SheetNames.includes('VENTES')) {
      sheetName = 'VENTES';
    } else {
      const venteSheet = workbook.SheetNames.find((n) => /vente/i.test(n));
      if (venteSheet) sheetName = venteSheet;
    }
    console.log(`Feuille utilisée : ${sheetName}`);

    const sheet = workbook.Sheets[sheetName];

    // Détecte où sont les en-têtes (scanne 5 premières lignes)
    let headerRowIdx = 0;
    let headers: string[] = [];
    for (let tryRow = 0; tryRow < 5; tryRow++) {
      try {
        const testRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
          raw: true,
          defval: null,
          range: tryRow,
        });
        if (testRows.length === 0) continue;
        const testHeaders = Object.keys(testRows[0]).map((h) => h.toLowerCase());
        const hasDate = testHeaders.some((h) => h.includes('date'));
        const hasOther = testHeaders.some((h) =>
          h.includes('enseigne') || h.includes('client') || h.includes('agent') || h.includes('commercial') || h.includes('montant') || h.includes('ca') || h.includes('bl')
        );
        if (hasDate && hasOther) {
          headerRowIdx = tryRow;
          headers = Object.keys(testRows[0]);
          break;
        }
      } catch {
        continue;
      }
    }

    if (headers.length === 0) {
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
    }

    console.log(`En-têtes détectés (ligne ${headerRowIdx + 1}) : ${headers.join(', ')}`);

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      raw: true,
      defval: null,
      range: headerRowIdx,
    });

    // Mapping des colonnes : soit fourni par l'utilisateur, soit auto-détecté
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

    let mapping: {
      date: string | null;
      bl: string | null;
      enseigne: string | null;
      type: string | null;
      agent: string | null;
      ht: string | null;
      ttc: string | null;
      taux: string | null;
      commission: string | null;
      mois: string | null;
      annee: string | null;
    };

    // Auto-détection de base (sera surchargée par le mapping utilisateur si fourni)
    // On utilise un Set des colonnes déjà assignées pour éviter les conflits
    const usedCols = new Set<string>();
    const findColUnique = (patterns: string[]): string | null => {
      for (const p of patterns) {
        const pl = p.toLowerCase();
        const found = headers.find((h) => {
          if (usedCols.has(h)) return false; // skip déjà assignées
          const hl = h.toLowerCase().trim();
          return hl === pl || hl.includes(pl);
        });
        if (found) {
          usedCols.add(found);
          return found;
        }
      }
      return null;
    };

    // L'ordre des détections compte pour éviter les conflits (ex: "Taux Commission")
    // On détecte d'abord les colonnes les plus spécifiques, puis les génériques
    const autoMapping = {
      // D'abord les champs précis
      bl: findColUnique(['N° BL', 'NUMERO BL', 'N BL', 'BON', 'BL']),
      type: findColUnique(['TYPE', 'CANAL']),
      agent: findColUnique(['AGENT', 'COMMERCIAL', 'REPRESENTANT']),
      enseigne: findColUnique(['ENSEIGNE', 'CLIENT']),
      date: findColUnique(['DATE']),
      // Puis montants et taux - dans l'ordre du plus spécifique au moins spécifique
      taux: findColUnique(['TAUX']), // capte "Taux Commission" et "Taux"
      commission: findColUnique(['MONTANT COMMISSION', 'COMMISSION']), // évite "Taux Commission" déjà pris
      ht: findColUnique(['MONTANT HT', 'CA HT', 'HT']),
      ttc: findColUnique(['MONTANT TTC', 'CA TTC', 'TTC']),
      mois: findColUnique(['MOIS']),
      annee: findColUnique(['ANN']),
    };

    if (mappingRaw) {
      try {
        const parsed = JSON.parse(mappingRaw);
        // Pour chaque champ : utilise la valeur fournie, sinon l'auto-détection
        mapping = {
          date: parsed.date ?? autoMapping.date,
          bl: parsed.bl ?? autoMapping.bl,
          enseigne: parsed.enseigne ?? autoMapping.enseigne,
          type: parsed.type ?? autoMapping.type,
          agent: parsed.agent ?? autoMapping.agent,
          ht: parsed.ht ?? autoMapping.ht,
          ttc: parsed.ttc ?? autoMapping.ttc,
          taux: parsed.taux ?? autoMapping.taux,
          commission: parsed.commission ?? autoMapping.commission,
          mois: parsed.mois ?? autoMapping.mois,
          annee: parsed.annee ?? autoMapping.annee,
        };
        console.log('Mapping utilisateur + auto-détection :', mapping);
      } catch {
        return NextResponse.json(
          { ok: false, error: 'Mapping invalide (JSON malformé).' },
          { status: 400 }
        );
      }
    } else {
      mapping = autoMapping;
      console.log('Mapping auto-détecté :', mapping);
    }

    // Validation : date et (ht OU ttc OU commission) sont obligatoires
    if (!mapping.date) {
      return NextResponse.json(
        {
          ok: false,
          error: `Colonne "DATE" introuvable. Colonnes détectées : ${headers.join(', ')}`,
          detectedColumns: headers,
          mapping,
        },
        { status: 400 }
      );
    }

    if (!mapping.ht && !mapping.ttc) {
      return NextResponse.json(
        {
          ok: false,
          error: `Aucune colonne de montant (HT ou TTC) détectée. Colonnes : ${headers.join(', ')}`,
          detectedColumns: headers,
          mapping,
        },
        { status: 400 }
      );
    }

    if (!mapping.enseigne) {
      return NextResponse.json(
        {
          ok: false,
          error: `Aucune colonne "ENSEIGNE" ou "CLIENT" détectée. Colonnes : ${headers.join(', ')}`,
          detectedColumns: headers,
          mapping,
        },
        { status: 400 }
      );
    }

    // Récupère les deduplicationKeys déjà en base
    const existingKeys = new Set(
      (await db.sale.findMany({ select: { deduplicationKey: true } })).map((s) => s.deduplicationKey)
    );
    console.log(`Clés déjà en base : ${existingKeys.size}`);

    // Prépare les ventes à insérer
    const toInsert: Array<{
      blNumber: string | null;
      deduplicationKey: string;
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
    let skippedNoAmount = 0;
    let skippedDuplicate = 0;
    let skippedInvalid = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const dateRaw = mapping.date ? row[mapping.date] : null;
      const blRaw = mapping.bl ? row[mapping.bl] : null;
      const enseigneRaw = mapping.enseigne ? row[mapping.enseigne] : null;
      const typeRaw = mapping.type ? row[mapping.type] : null;
      const agentRaw = mapping.agent ? row[mapping.agent] : null;
      const htRaw = mapping.ht ? row[mapping.ht] : null;
      const ttcRaw = mapping.ttc ? row[mapping.ttc] : null;
      const tauxRaw = mapping.taux ? row[mapping.taux] : null;
      const commissionRaw = mapping.commission ? row[mapping.commission] : null;
      const moisRaw = mapping.mois ? row[mapping.mois] : null;
      const anneeRaw = mapping.annee ? row[mapping.annee] : null;

      // Parsing date
      let date: Date | null = null;
      if (dateRaw instanceof Date) {
        date = dateRaw;
      } else if (typeof dateRaw === 'number') {
        const epoch = new Date(Date.UTC(1899, 11, 30));
        date = new Date(epoch.getTime() + dateRaw * 86400000);
      } else if (typeof dateRaw === 'string' && dateRaw.trim()) {
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
          if (!isNaN(parsed.getTime())) date = parsed;
        }
      }
      if (!date || isNaN(date.getTime()) || date.getFullYear() < 2020) {
        skippedNoDate++;
        continue;
      }

      // Skip si pas d'enseigne ni de montant
      const toStr = (v: unknown): string => (v ? String(v).trim() : '');
      const toNum = (v: unknown): number => {
        if (typeof v === 'number') return v;
        if (typeof v === 'string') {
          const cleaned = v.replace(/\s/g, '').replace(/€/g, '').replace(',', '.');
          const n = parseFloat(cleaned);
          return isNaN(n) ? 0 : n;
        }
        return 0;
      };

      const enseigne = toStr(enseigneRaw);
      if (!enseigne) {
        skippedInvalid++;
        continue;
      }

      const amountHT = toNum(htRaw);
      const amountTTC = toNum(ttcRaw);
      // Si HT absent mais TTC présent : estimer HT = TTC / 1.056 (TVA 5.6% alimentaire) ou / 1.2
      const finalHT = amountHT || (amountTTC ? amountTTC / 1.056 : 0);
      if (finalHT === 0) {
        skippedNoAmount++;
        continue;
      }

      const type = toStr(typeRaw) || 'Direct';
      const agent = toStr(agentRaw) || 'Inconnu';
      const rate = toNum(tauxRaw) || (type === 'Direct' ? 0.07 : 0.05);
      const commission = toNum(commissionRaw) || finalHT * rate;
      const month = moisRaw ? Math.floor(toNum(moisRaw)) || date.getMonth() + 1 : date.getMonth() + 1;
      const year = anneeRaw ? Math.floor(toNum(anneeRaw)) || date.getFullYear() : date.getFullYear();

      // BL optionnel
      const blNumber = blRaw ? toStr(blRaw) : null;

      // deduplicationKey : BL si présent, sinon hash de (date+enseigne+type+amountHT)
      const deduplicationKey = blNumber
        || `${date.toISOString().split('T')[0]}|${enseigne}|${type}|${finalHT.toFixed(2)}`;

      // Vérifie doublons (base + intra-batch)
      if (existingKeys.has(deduplicationKey)) {
        skippedDuplicate++;
        continue;
      }
      if (toInsert.some((v) => v.deduplicationKey === deduplicationKey)) {
        skippedDuplicate++;
        continue;
      }

      toInsert.push({
        blNumber,
        deduplicationKey,
        date,
        enseigne,
        type,
        agent,
        amountHT: finalHT,
        amountTTC: amountTTC || finalHT * 1.056,
        rate,
        commission,
        month,
        year,
      });

      // Enseigne de référence
      if (!newEnseignes.has(enseigne)) {
        newEnseignes.set(enseigne, { name: enseigne, type, agent });
      }
    }

    console.log(`Pré-import : ${toInsert.length} à insérer, doublons=${skippedDuplicate}, sans date=${skippedNoDate}, sans montant=${skippedNoAmount}, invalides=${skippedInvalid}`);

    // Mode détection : on renvoie juste le mapping + un aperçu sans rien insérer
    if (detectOnly) {
      return NextResponse.json({
        ok: true,
        detectedColumns: headers,
        detectedMapping: mapping,
        preview: {
          totalRows: rows.length,
          validRows: toInsert.length,
          duplicates: skippedDuplicate,
          noDate: skippedNoDate,
          noAmount: skippedNoAmount,
          invalid: skippedInvalid,
          sample: toInsert.slice(0, 3).map((v) => ({
            date: v.date.toISOString().split('T')[0],
            enseigne: v.enseigne,
            type: v.type,
            agent: v.agent,
            amountHT: v.amountHT,
          })),
        },
      });
    }

    // Insertion
    let inserted = 0;
    for (const v of toInsert) {
      try {
        await db.sale.create({ data: v });
        inserted++;
      } catch (e) {
        // Doublon (race condition) : ignore
      }
    }

    // Nouvelles enseignes
    for (const e of Array.from(newEnseignes.values())) {
      try {
        await db.enseigne.create({ data: e });
      } catch {
        // Ignore doublons
      }
    }

    // Met à jour la période courante si on a importé
    if (inserted > 0) {
      const lastDate = toInsert.reduce((max, v) =>
        v.date > max ? v.date : max, toInsert[0].date);
      await setCurrentPeriod(lastDate.getFullYear(), lastDate.getMonth() + 1);
      console.log(`Période mise à jour : ${lastDate.getMonth() + 1}/${lastDate.getFullYear()}`);
    }

    const totalSkipped = skippedNoDate + skippedNoAmount + skippedDuplicate + skippedInvalid;
    const detail = [
      `${inserted} nouvelle(s) vente(s)`,
      skippedDuplicate > 0 ? `${skippedDuplicate} doublon(s)` : null,
      skippedNoDate > 0 ? `${skippedNoDate} sans date` : null,
      skippedNoAmount > 0 ? `${skippedNoAmount} sans montant` : null,
      skippedInvalid > 0 ? `${skippedInvalid} invalide(s)` : null,
    ].filter(Boolean).join(', ');

    console.log(`Import terminé : ${detail}`);

    return NextResponse.json({
      ok: true,
      result: {
        inserted,
        skipped: totalSkipped,
        errors,
        total: toInsert.length,
      },
      detail,
      detectedMapping: mapping,
      detectedColumns: headers,
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

// GET /api/import/detect?file=... : détecte les colonnes d'un fichier sans importer
// Utilisé pour afficher le mapping dans l'UI avant validation
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    // Cette route GET ne fait rien de spécial pour l'instant
    // Le mapping est détecté dans le POST
    return NextResponse.json({
      ok: true,
      message: 'Utilisez POST pour importer un fichier.',
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    );
  }
}
