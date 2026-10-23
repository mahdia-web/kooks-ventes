import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { db } from '@/lib/db';
import { labelForCompte, isChargeDirecte } from '@/lib/compte-comptable';

// Augmente le timeout Vercel à 60s
export const maxDuration = 60;

/**
 * POST /api/charges/import
 * Body: multipart/form-data avec "file" (Excel)
 * Champs optionnels: "forceCategory" (impose une catégorie), "replaceDuplicates" (booléen)
 *
 * Auto-détection des colonnes Excel:
 *  - Date: 'DATE', 'JOUR', 'DATE FACTURE', 'DATE OPÉRATION'
 *  - Catégorie: 'CATÉGORIE', 'TYPE', 'NATURE', 'CLASSE'
 *  - Libellé: 'LIBELLÉ', 'DESCRIPTION', 'DÉTAIL', 'INTITULÉ', 'OPÉRATION'
 *  - Fournisseur: 'FOURNISSEUR', 'TIERS', 'BÉNÉFICIAIRE', 'PAYÉ À'
 *  - Montant HT: 'MONTANT HT', 'MT HT', 'HT'
 *  - Montant TTC: 'MONTANT TTC', 'MT TTC', 'TTC', 'MONTANT'
 *  - TVA: 'TVA', 'TAUX TVA'
 *  - Enseigne: 'ENSEIGNE', 'CLIENT', 'MAGASIN' (si charge attribuable à un client)
 *  - N° BL: 'BL', 'BON DE LIVRAISON', 'N° BL'
 *
 * Si la catégorie n'est pas détectée, on tente de l'inférer à partir du libellé
 * (mots-clés: transport, livraison, salaire, loyer, électricité, etc.)
 */
export async function POST(req: NextRequest) {
  console.log('=== POST /api/charges/import ===');
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const forceCategory = (formData.get('forceCategory') as string | null) ?? '';
    const replaceDuplicates = formData.get('replaceDuplicates') === 'true';

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ ok: false, error: 'Aucun fichier reçu.' }, { status: 400 });
    }

    console.log(`Fichier reçu : ${file.name} (${file.size} octets) forceCategory=${forceCategory}`);

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    console.log(`Feuilles : ${workbook.SheetNames.join(', ')}`);

    // Cherche la bonne feuille
    let sheetName = workbook.SheetNames[0] ?? '';
    if (workbook.SheetNames.includes('CHARGES')) {
      sheetName = 'CHARGES';
    } else if (workbook.SheetNames.includes('DEPENSES')) {
      sheetName = 'DEPENSES';
    } else {
      const chargeSheet = workbook.SheetNames.find((n) => /charge|dépense|depense|frais/i.test(n));
      if (chargeSheet) sheetName = chargeSheet;
    }
    const sheet = workbook.Sheets[sheetName];
    console.log(`Feuille utilisée : ${sheetName}`);

    // Détecte où sont les en-têtes (scanne 5 premières lignes)
    let headerRowIdx = 0;
    let headers: string[] = [];
    for (let tryRow = 0; tryRow < 5; tryRow++) {
      try {
        const testRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
          raw: false, defval: null, range: tryRow,
        });
        if (testRows.length === 0) continue;
        const testHeaders = Object.keys(testRows[0]).map((h) => h.toLowerCase());
        const hasDate = testHeaders.some((h) => h.includes('date') || h.includes('jour'));
        const hasAmount = testHeaders.some((h) =>
          h.includes('montant') || h.includes('mt ht') || h.includes('mt ttc') || h === 'ht' || h === 'ttc'
        );
        if (hasDate && hasAmount) {
          headerRowIdx = tryRow;
          headers = Object.keys(testRows[0]);
          break;
        }
      } catch { continue; }
    }

    if (headers.length === 0) {
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: false, defval: null });
      if (rows.length === 0) {
        return NextResponse.json(
          { ok: false, error: `La feuille "${sheetName}" ne contient aucune donnée.` },
          { status: 400 }
        );
      }
      headers = Object.keys(rows[0]);
    }

    console.log(`En-têtes détectés : ${headers.join(', ')}`);

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      raw: false, defval: null, range: headerRowIdx,
    });

    // Normalisation (accent-insensible)
    const normalize = (s: string) =>
      s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[''`]/g, '').trim();

    const usedCols = new Set<string>();
    const findCol = (patterns: string[]): string | null => {
      for (const p of patterns) {
        const pl = normalize(p);
        const found = headers.find((h) => {
          if (usedCols.has(h)) return false;
          const hl = normalize(h);
          return hl === pl || hl.includes(pl);
        });
        if (found) { usedCols.add(found); return found; }
      }
      return null;
    };

    // IMPORTANT: detect combinedAmount FIRST so the combined column (e.g.
    // "Montant HT / TVA / TTC") is claimed before the simple 'HT' pattern
    // can match it via the includes() rule.
    const combinedAmount = findCol(['MONTANT HT / TVA / TTC', 'MONTANT HT TVA TTC', 'MT HT TVA TTC', 'MONTANT HT/TVA/TTC']);

    const auto = {
      // Date : on accepte ÉMISSION (date de facturation, préféré) puis AJOUT,
      // puis les formats classiques (DATE FACTURE, DATE OPERATION, etc.)
      date: findCol(['EMISSION', 'ÉMISSION', 'DATE FACTURE', 'DATE OPERATION', 'DATE OPÉRATION', 'DATE', 'JOUR', 'AJOUT']),
      // Catégorie : COMPTES COMPTABLES peut servir de catégorie, sinon TYPE/NATURE/CLASSE
      category: findCol(['CATEGORIE', 'CATÉGORIE', 'COMPTES COMPTABLES', 'COMPTE COMPTABLE', 'TYPE', 'NATURE', 'CLASSE', 'FAMILLE']),
      // Libellé : COMMENTAIRES est souvent utilisé dans les exports comptables
      subLabel: findCol(['LIBELLE', 'LIBELLÉ', 'COMMENTAIRES', 'DESCRIPTION', 'DÉTAIL', 'DETAIL', 'INTITULE', 'INTITULÉ', 'OPÉRATION', 'OPERATION']),
      // Fournisseur : colonne "Fournisseur" typique des exports d'achats
      vendor: findCol(['FOURNISSEUR', 'TIERS', 'BÉNÉFICIAIRE', 'BENEFICIAIRE', 'PAYÉ À', 'PAYE A', 'DESTINATAIRE']),
      // Montants : colonnes séparées HT/TTC (uniquement si pas déjà pris par combinedAmount)
      ht: findCol(['MONTANT HT', 'MT HT', 'HT']),
      ttc: findCol(['MONTANT TTC', 'MT TTC', 'TTC', 'MONTANT']),
      vatRate: findCol(['TAUX TVA', 'TVA']),
      enseigne: findCol(['ENSEIGNE', 'CLIENT', 'MAGASIN', 'CLIENT FINAL']),
      bl: findCol(['NUMERO BL', 'N° BL', 'BL', 'BON DE LIVRAISON']),
      // Référence facture (numéro de facture/achat) — utile pour tracer la charge
      factureRef: findCol(['NUMERO FACTURE', 'N° FACTURE', 'NUMERO ACHAT', "NUMÉRO DE L'ACHAT", "NUMERO DE L ACHAT", "FACTURE", "NUMERO DE LA FACTURE"]),
      combinedAmount,
    };

    // Si aucune colonne montant séparée n'a été trouvée, mais qu'il existe
    // des colonnes "Montant HT", "TVA", "TTC" qui sont des sous-colonnes d'un
    // en-tête groupé "Montant HT / TVA / TTC", on les détecte avec un
    // pattern plus souple (le 2e findCol sur 'TVA' peut maintenant les attraper)
    if (!auto.ht && !auto.ttc && !auto.combinedAmount) {
      // Dernier recours : cherche une colonne dont le nom CONTIENT "HT" ou "TTC"
      const htCol = headers.find((h) => {
        if (usedCols.has(h)) return false;
        const hl = normalize(h);
        return hl.endsWith('ht') || hl === 'montantht' || hl === 'mtht';
      });
      if (htCol) { usedCols.add(htCol); (auto as any).ht = htCol; }
      const ttcCol = headers.find((h) => {
        if (usedCols.has(h)) return false;
        const hl = normalize(h);
        return hl.endsWith('ttc') || hl === 'montantttc' || hl === 'mtttc';
      });
      if (ttcCol) { usedCols.add(ttcCol); (auto as any).ttc = ttcCol; }
    }

    console.log('Mapping auto-détecté :', auto);

    if (!auto.date) {
      return NextResponse.json(
        { ok: false, error: `Colonne "DATE" introuvable. Colonnes détectées : ${headers.join(', ')}. Astuce : le système reconnaît aussi "Émission", "Ajout", "Date facture", "Date opération".`, detectedColumns: headers },
        { status: 400 }
      );
    }
    // Valide les montants : il faut AU MOINS un montant (HT, TTC, ou la colonne combinée)
    if (!auto.ht && !auto.ttc && !auto.combinedAmount) {
      return NextResponse.json(
        { ok: false, error: `Aucune colonne de montant (HT, TTC, ou "Montant HT / TVA / TTC") détectée. Colonnes: ${headers.join(', ')}`, detectedColumns: headers },
        { status: 400 }
      );
    }

    // Mots-clés pour l'auto-détection de la catégorie quand la colonne est absente
    const KEYWORD_CATEGORIES: Array<{ keywords: string[]; category: string }> = [
      { keywords: ['transport', 'livraison', 'frais port', 'port ', 'expedition', 'expédition', 'logistique', 'palette', 'camion'], category: 'Transport' },
      { keywords: ['salaire', 'remuneration', 'rémunération', 'paie', 'charges sociales', 'urssaf', 'cotisation'], category: 'Salaires & charges sociales' },
      { keywords: ['loyer', 'bail', 'location immobilier'], category: 'Loyer' },
      { keywords: ['electricite', 'électricité', 'eau', 'gaz', 'energie', 'énergie', 'edf', 'engie'], category: 'Énergie' },
      { keywords: ['marketing', 'publicite', 'publicité', 'promotion', 'communication', 'affichage', 'reseau social'], category: 'Marketing' },
      { keywords: ['assurance', 'mutuelle'], category: 'Assurances' },
      { keywords: ['telephone', 'téléphone', 'internet', 'abonnement telecom', 'mobile'], category: 'Télécom' },
      { keywords: ['fourniture', 'fournitures', 'papeterie', 'bureautique'], category: 'Fournitures bureau' },
      { keywords: ['entretien', 'menage', 'ménage', 'nettoyage', 'maintenance'], category: 'Entretien & maintenance' },
      { keywords: ['carburant', 'essence', 'gazoil', 'diesel'], category: 'Carburant' },
      { keywords: ['achat', 'matiere premiere', 'matière première', 'ingredient', 'ingrédient', 'emballage'], category: 'Achats matières' },
      { keywords: ['honoraire', 'comptable', 'avocat', 'juridique', 'audit'], category: 'Honoraires' },
      { keywords: ['taxe', 'impot', 'impôt', 'tva'], category: 'Taxes & impôts' },
    ];
    const inferCategory = (text: string): string => {
      const t = normalize(text);
      for (const rule of KEYWORD_CATEGORIES) {
        if (rule.keywords.some((kw) => t.includes(normalize(kw)))) return rule.category;
      }
      return 'Autres';
    };

    // Charge les deduplicationKeys existants
    const existingKeys = new Set(
      (await db.charge.findMany({ select: { deduplicationKey: true } })).map((c) => c.deduplicationKey)
    );
    console.log(`Clés déjà en base : ${existingKeys.size}`);

    const toInsert: Array<{
      date: Date; month: number; year: number;
      category: string; subLabel: string | null; vendor: string | null;
      amountHT: number; amountTTC: number; vatRate: number | null;
      enseigne: string | null; blNumber: string | null;
      allocationMethod: string; source: string; filePath: string | null;
      deduplicationKey: string;
    }> = [];

    let skippedNoDate = 0, skippedNoAmount = 0, skippedDuplicate = 0, skippedInvalid = 0;

    for (const row of rows) {
      const toStr = (v: unknown): string => (v ? String(v).trim() : '');
      const toNum = (v: unknown): number => {
        if (typeof v === 'number') return v;
        if (typeof v === 'string') {
          // Gère "1 234,56 €" → 1234.56
          const cleaned = v.replace(/\s/g, '').replace(/€/g, '').replace(',', '.');
          const n = parseFloat(cleaned);
          return isNaN(n) ? 0 : n;
        }
        return 0;
      };

      // Parsing date
      let date: Date | null = null;
      const dateRaw = row[auto.date];
      if (dateRaw instanceof Date) {
        date = dateRaw;
      } else if (typeof dateRaw === 'number') {
        const epoch = new Date(Date.UTC(1899, 11, 30));
        date = new Date(epoch.getTime() + dateRaw * 86400000);
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
          const p = new Date(t);
          if (!isNaN(p.getTime())) date = p;
        }
      }
      if (!date || isNaN(date.getTime()) || date.getFullYear() < 2020) {
        skippedNoDate++;
        continue;
      }

      // Montant — gère 3 cas :
      //   1. Colonnes séparées HT + TTC (classique)
      //   2. Colonne combinée "Montant HT / TVA / TTC" (un seul champ avec
      //      3 valeurs séparées par / ou | ou tabulation)
      //   3. Une seule colonne TTC ou HT
      let amountHT = auto.ht ? toNum(row[auto.ht]) : 0;
      let amountTTC = auto.ttc ? toNum(row[auto.ttc]) : 0;
      let amountTVA_fromCombined = 0;

      if (auto.combinedAmount) {
        // Parse la valeur combinée : "100.00 / 20.00 / 120.00"
        const combined = toStr(row[auto.combinedAmount]);
        if (combined) {
          // Split sur '/', '|' ou tabulation
          const parts = combined.split(/[\/|,\t]+/).map((s) => s.trim()).filter(Boolean);
          if (parts.length >= 1) {
            // Le 1er est HT (si pas déjà renseigné), le 2e est TVA, le 3e est TTC
            if (parts.length >= 3) {
              if (!amountHT) amountHT = toNum(parts[0]);
              amountTVA_fromCombined = toNum(parts[1]);
              if (!amountTTC) amountTTC = toNum(parts[2]);
            } else if (parts.length === 2) {
              // HT / TTC
              if (!amountHT) amountHT = toNum(parts[0]);
              if (!amountTTC) amountTTC = toNum(parts[1]);
            } else {
              // une seule valeur — c'est probablement le TTC
              if (!amountTTC) amountTTC = toNum(parts[0]);
              if (!amountHT) amountHT = toNum(parts[0]);
            }
          }
        }
      }

      const finalHT = amountHT || (amountTTC ? amountTTC : 0);
      const finalTTC = amountTTC || finalHT;
      if (finalHT === 0) { skippedNoAmount++; continue; }

      // TVA
      let vatRate: number | null = null;
      if (auto.vatRate) {
        const v = toNum(row[auto.vatRate]);
        if (v > 0) vatRate = v > 1 ? v / 100 : v;
      }
      if (vatRate === null && amountTVA_fromCombined > 0 && finalHT > 0) {
        vatRate = amountTVA_fromCombined / finalHT;
      }
      if (vatRate === null && finalHT > 0 && finalTTC > finalHT) {
        vatRate = (finalTTC - finalHT) / finalHT;
      }

      // Catégorie : forceCategory > colonne fichier > inférence libellé
      const subLabel = auto.subLabel ? toStr(row[auto.subLabel]) : '';
      const vendor = auto.vendor ? toStr(row[auto.vendor]) : '';
      let category: string;
      if (forceCategory && forceCategory.trim()) {
        category = forceCategory.trim();
      } else if (auto.category) {
        // La colonne "Comptes comptables" contient des numéros de compte (ex: "60614000"
        // ou "60110000, 62410000"). On les convertit en libellés lisibles via le
        // mapping du Plan Comptable Général (src/lib/compte-comptable.ts).
        const rawCategory = toStr(row[auto.category]);
        if (rawCategory && /^[\d\s,]+$/.test(rawCategory)) {
          // La valeur ressemble à un numéro de compte → on la passe par le mapping
          category = labelForCompte(rawCategory);
        } else if (rawCategory) {
          // Sinon, c'est probablement déjà un libellé — on le garde tel quel
          category = rawCategory;
        } else {
          category = inferCategory(`${subLabel} ${vendor}`);
        }
      } else {
        category = inferCategory(`${subLabel} ${vendor}`);
      }
      if (!category) category = 'Autres charges';

      // Enseigne + BL (optionnels)
      const enseigne = auto.enseigne ? toStr(row[auto.enseigne]) : '';
      const blNumber = auto.bl ? toStr(row[auto.bl]) : '';

      // Allocation method intelligent basé sur la compta analytique:
      // - Si la charge a un client (enseigne) renseigné → DIRECT
      // - Sinon, on regarde la catégorie: achats matières, emballages,
      //   transport sur ventes → DIRECT (charges opérationnelles)
      // - Tout le reste (loyer, électricité, salaires, etc.) → GLOBAL (structure)
      const allocationMethod = (enseigne || isChargeDirecte(category)) ? 'DIRECT' : 'GLOBAL';

      // deduplicationKey
      const deduplicationKey = `IMPORT|${date.toISOString().split('T')[0]}|${category}|${finalHT.toFixed(2)}|${subLabel}|${vendor}`;

      if (!replaceDuplicates && existingKeys.has(deduplicationKey)) {
        skippedDuplicate++;
        continue;
      }
      if (toInsert.some((v) => v.deduplicationKey === deduplicationKey)) {
        skippedDuplicate++;
        continue;
      }

      toInsert.push({
        date,
        month: date.getMonth() + 1,
        year: date.getFullYear(),
        category,
        subLabel: subLabel || null,
        vendor: vendor || null,
        amountHT: finalHT,
        amountTTC: finalTTC,
        vatRate,
        enseigne: enseigne || null,
        blNumber: blNumber || null,
        allocationMethod,
        source: 'IMPORT',
        filePath: file.name,
        deduplicationKey,
      });
    }

    console.log(`Pré-import : ${toInsert.length} charges à insérer, doublons=${skippedDuplicate}, sans date=${skippedNoDate}, sans montant=${skippedNoAmount}`);

    // Insertion par lots
    let inserted = 0, updated = 0;
    const BATCH_SIZE = 100;
    if (!replaceDuplicates) {
      for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
        const batch = toInsert.slice(i, i + BATCH_SIZE);
        try {
          const result = await db.charge.createMany({ data: batch, skipDuplicates: true });
          inserted += result.count;
        } catch {
          for (const v of batch) {
            try { await db.charge.create({ data: v }); inserted++; } catch {}
          }
        }
      }
    } else {
      for (const v of toInsert) {
        try {
          if (existingKeys.has(v.deduplicationKey)) {
            const { deduplicationKey, ...rest } = v;
            await db.charge.updateMany({ where: { deduplicationKey: v.deduplicationKey }, data: rest });
            updated++;
          } else {
            await db.charge.create({ data: v });
            inserted++;
          }
        } catch {}
      }
    }

    const totalSkipped = skippedNoDate + skippedNoAmount + skippedDuplicate + skippedInvalid;
    const detail = [
      `${inserted} nouvelle(s)`,
      updated > 0 ? `${updated} MAJ` : null,
      (!replaceDuplicates && skippedDuplicate > 0) ? `${skippedDuplicate} doublon(s)` : null,
      skippedNoDate > 0 ? `${skippedNoDate} sans date` : null,
      skippedNoAmount > 0 ? `${skippedNoAmount} sans montant` : null,
    ].filter(Boolean).join(', ');

    console.log(`Import charges terminé : ${detail}`);

    return NextResponse.json({
      ok: true,
      result: { inserted, updated, skipped: totalSkipped, total: toInsert.length },
      detail,
      detectedMapping: auto,
      detectedColumns: headers,
      totals: {
        totalHT: toInsert.reduce((s, v) => s + v.amountHT, 0),
        totalTTC: toInsert.reduce((s, v) => s + v.amountTTC, 0),
        byCategory: toInsert.reduce((acc, v) => {
          acc[v.category] = (acc[v.category] ?? 0) + v.amountHT;
          return acc;
        }, {} as Record<string, number>),
      },
    });
  } catch (e) {
    console.error('Erreur /api/charges/import:', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur serveur inattendue' },
      { status: 500 }
    );
  }
}
