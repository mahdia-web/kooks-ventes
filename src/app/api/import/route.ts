import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { db } from '@/lib/db';
import { setCurrentPeriod } from '@/lib/dashboard-service';

// POST /api/import
// Body: multipart/form-data avec champs "file" (Excel), "forceType", "forceAgent", "replaceDuplicates", "detectOnly"
export async function POST(req: NextRequest) {
  console.log('=== POST /api/import ===');
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const mappingRaw = formData.get('mapping') as string | null;
    const detectOnly = formData.get('detectOnly') === 'true';
    const forceType = (formData.get('forceType') as string | null) ?? 'auto';
    const forceAgent = (formData.get('forceAgent') as string | null) ?? '';
    const replaceDuplicates = formData.get('replaceDuplicates') === 'true';

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: 'Aucun fichier reçu.' },
        { status: 400 }
      );
    }

    console.log(`Fichier reçu : ${file.name} (${file.size} octets) detectOnly=${detectOnly} forceType=${forceType} forceAgent=${forceAgent} replaceDuplicates=${replaceDuplicates}`);

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
          raw: false,
          defval: null,
          range: tryRow,
        });
        if (testRows.length === 0) continue;
        const testHeaders = Object.keys(testRows[0]).map((h) => h.toLowerCase());
        const hasDate = testHeaders.some((h) => h.includes('date'));
        const hasOther = testHeaders.some((h) =>
          h.includes('enseigne') || h.includes('client') || h.includes('montant') || h.includes('ca') || h.includes('ht')
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
        raw: false,
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

    // Lit les lignes en raw=false (texte) pour bien gérer les décimales françaises (436,16 vs 43616)
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      raw: false,
      defval: null,
      range: headerRowIdx,
    });

    // Helper de normalisation (gère les accents et apostrophes)
    const normalize = (s: string) =>
      s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[''`]/g, '').trim();

    // Auto-détection des colonnes (avec unicité)
    const usedCols = new Set<string>();
    const findCol = (patterns: string[]): string | null => {
      for (const p of patterns) {
        const pl = normalize(p);
        const found = headers.find((h) => {
          if (usedCols.has(h)) return false;
          const hl = normalize(h);
          return hl === pl || hl.includes(pl);
        });
        if (found) {
          usedCols.add(found);
          return found;
        }
      }
      return null;
    };

    // Ordre important : du plus spécifique au moins spécifique pour éviter les conflits
    const auto = {
      taux: findCol(['% MARGE COMMERCIALE','MARGE COMMERCIALE','TAUX']),
      commission: findCol(['MONTANT COMMISSION','COMMISSION']),
      bl: findCol(['NUMERO BL','N° BL','NUMERO','N BL','BON DE LIVRAISON','BL','RÉFÉRENCE','REFERENCE','REF']),
      agent: findCol(['COMMERCIAL','AGENT','REPRESENTANT','VENDEUR']),
      reference: findCol(['RÉFÉRENCE','REFERENCE','REF']),
      type: findCol(['TYPE','CANAL','CIRCUIT']),
      enseigne: findCol(['ENSEIGNE','CLIENT','MAGASIN']),
      date: findCol(['DATE']),
      ht: findCol(['MONTANT HT','CA HT','MT HT','HT']),
      ttc: findCol(['MONTANT TTC','CA TTC','MT TTC','TTC']),
      // Ne pas détecter MOIS/ANNEE : on utilise toujours la date parsée
      mois: null as string | null,
      annee: null as string | null,
    };

    let mapping: typeof auto;
    if (mappingRaw) {
      try {
        const p = JSON.parse(mappingRaw);
        mapping = {
          taux: p.taux ?? auto.taux,
          commission: p.commission ?? auto.commission,
          bl: p.bl ?? auto.bl,
          agent: p.agent ?? auto.agent,
          reference: p.reference ?? auto.reference,
          type: p.type ?? auto.type,
          enseigne: p.enseigne ?? auto.enseigne,
          date: p.date ?? auto.date,
          ht: p.ht ?? auto.ht,
          ttc: p.ttc ?? auto.ttc,
          mois: null, // forcé : on n'utilise jamais de colonnes MOIS/ANNEE
          annee: null,
        };
        console.log('Mapping utilisateur + auto-détection :', mapping);
      } catch {
        return NextResponse.json(
          { ok: false, error: 'Mapping invalide (JSON malformé).' },
          { status: 400 }
        );
      }
    } else {
      mapping = auto;
      console.log('Mapping auto-détecté :', mapping);
    }

    // Validation
    if (!mapping.date) {
      return NextResponse.json(
        { ok: false, error: `Colonne "DATE" introuvable. Colonnes détectées : ${headers.join(', ')}`, detectedColumns: headers, mapping },
        { status: 400 }
      );
    }
    if (!mapping.ht && !mapping.ttc) {
      return NextResponse.json(
        { ok: false, error: `Aucune colonne de montant (HT ou TTC) détectée. Colonnes : ${headers.join(', ')}`, detectedColumns: headers, mapping },
        { status: 400 }
      );
    }
    if (!mapping.enseigne) {
      return NextResponse.json(
        { ok: false, error: `Aucune colonne "ENSEIGNE" ou "CLIENT" détectée. Colonnes : ${headers.join(', ')}`, detectedColumns: headers, mapping },
        { status: 400 }
      );
    }

    // Charge les données existantes
    const existingKeys = new Set(
      (await db.sale.findMany({ select: { deduplicationKey: true } })).map((s) => s.deduplicationKey)
    );
    const existingEnseignes = await db.enseigne.findMany();
    const enseigneTypeMap = new Map(existingEnseignes.map((e) => [e.name, e.type]));
    const activeAgents = await db.agent.findMany({ where: { isActive: true }, select: { name: true } });
    console.log(`Clés déjà en base : ${existingKeys.size}, enseignes : ${existingEnseignes.length}, agents actifs : ${activeAgents.length}`);

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
    let skippedNoDate = 0, skippedNoAmount = 0, skippedDuplicate = 0, skippedInvalid = 0;
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

      const toStr = (v: unknown): string => (v ? String(v).trim() : '');
      const toNum = (v: unknown): number => {
        if (typeof v === 'number') return v;
        if (typeof v === 'string') {
          // Gère les formats français : "1 234,56 €" → 1234.56
          const cleaned = v.replace(/\s/g, '').replace(/€/g, '').replace(',', '.');
          const n = parseFloat(cleaned);
          return isNaN(n) ? 0 : n;
        }
        return 0;
      };

      // Parsing date : gère Date, nombre (Excel serial), string (DD/MM/YYYY ou ISO)
      let date: Date | null = null;
      if (dateRaw instanceof Date) {
        date = dateRaw;
      } else if (typeof dateRaw === 'number') {
        const epoch = new Date(Date.UTC(1899, 11, 30));
        date = new Date(epoch.getTime() + dateRaw * 86400000);
      } else if (typeof dateRaw === 'string' && dateRaw.trim()) {
        const t = dateRaw.trim();
        // Format DD/MM/YYYY ou DD-MM-YYYY
        const m = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
        if (m) {
          const d = parseInt(m[1], 10);
          const mo = parseInt(m[2], 10);
          let y = parseInt(m[3], 10);
          if (y < 100) y += 2000;
          date = new Date(y, mo - 1, d);
        } else {
          const p = new Date(t);
          if (!isNaN(p.getTime())) date = p;
        }
      }

      if (!date || isNaN(date.getTime()) || date.getFullYear() < 2020) {
        skippedNoDate++;
        continue;
      }

      const enseigne = toStr(enseigneRaw);
      if (!enseigne || /^(total|totaux|somme)$/i.test(enseigne)) {
        skippedInvalid++;
        continue;
      }

      const amountHT = toNum(htRaw);
      const amountTTC = toNum(ttcRaw);
      // Si HT absent mais TTC présent : estimer HT = TTC / 1.056 (TVA 5.6% alimentaire)
      const finalHT = amountHT || (amountTTC ? amountTTC / 1.056 : 0);
      if (finalHT === 0) {
        skippedNoAmount++;
        continue;
      }

      // === Détection du type Centrale/Direct ===
      // Priorité : forceType > type en base (enseigne) > type dans le fichier > auto-détection par nom
      const ne = normalize(enseigne);
      const isCentrale = [
        'otera','scapest','scachap','scaouest','aldouest',
        'centra approvi','cooperative approvisionnement','societe cooperative dapprovi'
      ].some((p) => ne.includes(p));

      let type = '';
      if (forceType && forceType !== 'auto') {
        type = forceType;
      } else if (enseigneTypeMap.has(enseigne)) {
        type = enseigneTypeMap.get(enseigne)!;
      } else {
        type = toStr(typeRaw) || (isCentrale ? 'Centrale' : 'Direct');
      }

      // === Détection de l'agent ===
      // Priorité : forceAgent > colonne agent du fichier > extraction depuis référence > 'Inconnu'
      let agent = (forceAgent && forceAgent.trim()) || toStr(agentRaw);
      if (!agent && mapping.reference) {
        const ref = toStr(row[mapping.reference]);
        // Cherche "via XXX" ou "par XXX" dans la référence
        const m2 = ref.match(/\b(?:via|par)\s+([A-Z][A-Z\s&]{2,30})/);
        if (m2) {
          agent = m2[1].trim().split(/\s+(?:À|A|ET|DE|POUR)\s+/)[0].trim();
        }
        // Cherche le nom d'un agent actif dans la référence
        if (!agent) {
          const ru = ref.toUpperCase();
          for (const a of activeAgents) {
            if (ru.includes(a.name.toUpperCase())) {
              agent = a.name;
              break;
            }
          }
        }
      }
      if (!agent) agent = 'Inconnu';

      // === Taux de commission ===
      // Règle Kooks : 7% sur le CA Direct, 5% sur le CA Centrale
      const explicitRate = toNum(tauxRaw);
      const rate = explicitRate > 0
        ? (explicitRate > 1 ? explicitRate / 100 : explicitRate)
        : (type === 'Centrale' ? 0.05 : 0.07);

      // === Montant commission ===
      const explicitCommission = toNum(commissionRaw);
      const commission = explicitCommission > 0 ? explicitCommission : finalHT * rate;

      // BL optionnel
      const blNumber = blRaw ? toStr(blRaw) : null;

      // deduplicationKey : BL+agent si BL présent, sinon hash incluant l'agent
      // (l'agent est inclus pour éviter les faux doublons entre CAP FRAIS et BROCARD)
      const deduplicationKey = blNumber
        ? `${blNumber}|${agent}`
        : `${date.toISOString().split('T')[0]}|${enseigne}|${type}|${finalHT.toFixed(2)}|${agent}`;

      // Vérifie doublons
      if (!replaceDuplicates && existingKeys.has(deduplicationKey)) {
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
        // TOUJOURS utiliser la date parsée (jamais de colonnes MOIS/ANNEE)
        month: date.getMonth() + 1,
        year: date.getFullYear(),
      });

      if (!newEnseignes.has(enseigne)) {
        newEnseignes.set(enseigne, { name: enseigne, type, agent });
      }
    }

    console.log(`Pré-import : ${toInsert.length} à insérer, doublons=${skippedDuplicate}, sans date=${skippedNoDate}, sans montant=${skippedNoAmount}, invalides=${skippedInvalid}`);

    // Mode détection : on renvoie juste le mapping + un aperçu
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

    // Insertion (avec update si replaceDuplicates)
    let inserted = 0, updated = 0;
    for (const v of toInsert) {
      try {
        if (replaceDuplicates && existingKeys.has(v.deduplicationKey)) {
          const { deduplicationKey, ...ud } = v;
          await db.sale.updateMany({
            where: { deduplicationKey: v.deduplicationKey },
            data: ud,
          });
          updated++;
        } else {
          await db.sale.create({ data: v });
          inserted++;
        }
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
    if (inserted > 0 || updated > 0) {
      const nd = toInsert.reduce((max, v) => v.date > max ? v.date : max, toInsert[0].date);
      const dbLatest = await db.sale.findFirst({ orderBy: { date: 'desc' }, select: { date: true } });
      const ol = dbLatest && dbLatest.date > nd ? dbLatest.date : nd;
      await setCurrentPeriod(ol.getFullYear(), ol.getMonth() + 1);
      console.log(`Période mise à jour : ${ol.getMonth() + 1}/${ol.getFullYear()}`);
    }

    const totalSkipped = skippedNoDate + skippedNoAmount + skippedDuplicate + skippedInvalid;
    const detail = [
      `${inserted} nouvelle(s)`,
      updated > 0 ? `${updated} MAJ` : null,
      (!replaceDuplicates && skippedDuplicate > 0) ? `${skippedDuplicate} doublon(s)` : null,
      skippedNoDate > 0 ? `${skippedNoDate} sans date` : null,
      skippedNoAmount > 0 ? `${skippedNoAmount} sans montant` : null,
      skippedInvalid > 0 ? `${skippedInvalid} invalide(s)` : null,
    ].filter(Boolean).join(', ');

    console.log(`Import terminé : ${detail}`);

    return NextResponse.json({
      ok: true,
      result: { inserted, updated, skipped: totalSkipped, total: toInsert.length },
      detail,
      detectedMapping: mapping,
      detectedColumns: headers,
      totals: {
        commission: toInsert.reduce((s, v) => s + v.commission, 0),
        caHT: toInsert.reduce((s, v) => s + v.amountHT, 0),
      },
    });
  } catch (e) {
    console.error('Erreur non gérée /api/import:', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur serveur inattendue' },
      { status: 500 }
    );
  }
}

// GET /api/import/detect?file=... : non utilisé (le mapping est détecté dans le POST)
export async function GET(req: NextRequest) {
  return NextResponse.json({
    ok: true,
    message: 'Utilisez POST pour importer un fichier.',
  });
}
