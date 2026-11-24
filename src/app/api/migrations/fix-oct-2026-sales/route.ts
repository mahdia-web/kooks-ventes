import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { db } from '@/lib/db';
import { isKooksAgent } from '@/lib/dashboard-service';
import { resolveCanonicalName } from '@/lib/normalize-enseigne';

export const maxDuration = 60;

/**
 * POST /api/migrations/fix-oct-2026-sales
 * Body: multipart/form-data avec un champ "file" (Excel ventes ERP)
 *
 * Corrige les ventes d'octobre 2026 en base Sale pour qu'elles correspondent
 * exactement au fichier ERP de référence (ventes-1795508581301.xlsx).
 *
 * Trois écarts identifiés (analyse BL par BL):
 *
 * 1. 5 avoirs négatifs manquants en base (HT < 0 non importés):
 *    BL 26000657, 26000659, 26000660, 26000737, 26000792 → -1256,23 €
 *
 * 2. 17 BL coopératifs avec CA HT sous-évalué en base (remise ~12,58% appliquée
 *    à tort): SCACHAP, COOPERATIVE U, CORA LESQUIN → -1179,86 €
 *    Ratio base/fichier = 0,8742 (16 BL) et 0,8409 (1 BL CORA LESQUIN).
 *
 * 3. 2 BL à 0€ manquants en base: Costco Pontault (26000344), Carrefour Combs
 *    (26000533) → impact 0€ mais présence nécessaire pour cohérence.
 *
 * 4. 2 BL avec mauvais agent (CA ok, juste l'agent à corriger):
 *    BL 26000496 (AUCHAN MANDELIEU) et 26000539 (AUCHAN GRASSE)
 *    → SEBASTIEN GASNIER au lieu de KOOK'S
 *
 * Total correction: base 170 250,64 € → 170 174,27 € (aligné fichier ERP).
 *
 * Stratégie:
 *   - Pour chaque BL du fichier: met à jour amountHT/TTC/commission/agent
 *   - Pour les BL manquants (avoirs + BL à 0€): crée de nouvelles entrées
 *   - Pour les BL avec mauvais agent: supprime l'ancienne entrée (clé = BL|agent
 *     change) puis crée la nouvelle avec le bon agent
 *   - Ne supprime JAMAIS les BL qui sont en base mais pas dans le fichier
 *     (ils pourraient être légitimes d'autres mois)
 */
export async function POST(req: NextRequest) {
  console.log('[fix-oct-2026-sales] Starting correction');

  try {
    const formData = await req.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ ok: false, error: 'Aucun fichier reçu (champ "file" requis)' }, { status: 400 });
    }

    console.log(`[fix-oct-2026-sales] File: ${file.name} (${file.size} bytes)`);
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      raw: true,
      defval: null,
      range: 0,
    });

    if (rows.length === 0) {
      return NextResponse.json({ ok: false, error: 'Fichier vide' }, { status: 400 });
    }

    // Mapping colonnes: Référence, Date, Date facture, Client, ..., Montant HT (idx 7),
    //   Montant TTC (idx 10), Commercial (idx 16), TVA 5.5% (idx 20), TVA 20% (idx 21),
    //   TVA 2.10% (idx 22), CA HT 5.5% (idx 23), CA HT 20% (idx 24), CA HT 2.10% (idx 25), CA HT 0% (idx 26)
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
    const colDate = findCol(['Date']);
    const colClient = findCol(['Client']);
    const colHT = findCol(['Montant HT']);
    const colTTC = findCol(['Montant TTC']);
    const colCommercial = findCol(['Commercial']);

    console.log(`[fix-oct-2026-sales] Columns: ref=${colRef}, date=${colDate}, client=${colClient}, ht=${colHT}, ttc=${colTTC}, comm=${colCommercial}`);

    if (!colRef || !colClient || !colHT || !colDate) {
      return NextResponse.json({
        ok: false,
        error: `Colonnes manquantes. Détecté: ${headers.join(', ')}`,
      }, { status: 400 });
    }

    // Filtre les lignes de données (saute la ligne TOTAL)
    const dataRows = rows.filter(r => {
      const client = r[colClient];
      const ref = r[colRef];
      return client && String(client).trim().toUpperCase() !== 'TOTAL' && ref != null;
    });

    console.log(`[fix-oct-2026-sales] ${dataRows.length} data rows (after TOTAL filter)`);

    // Parse une date DD/MM/YYYY
    const parseDateCell = (raw: unknown): Date | null => {
      if (raw == null) return null;
      if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
      if (typeof raw === 'number') {
        const d = new Date(Date.UTC(1899, 11, 30) + raw * 86400000);
        return isNaN(d.getTime()) ? null : d;
      }
      if (typeof raw === 'string') {
        const t = raw.trim();
        const m = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
        if (m) {
          const d = parseInt(m[1], 10);
          const mo = parseInt(m[2], 10);
          let y = parseInt(m[3], 10);
          if (y < 100) y += 2000;
          const dt = new Date(y, mo - 1, d);
          return isNaN(dt.getTime()) ? null : dt;
        }
        const dt = new Date(t);
        return isNaN(dt.getTime()) ? null : dt;
      }
      return null;
    };

    // Récupère les agents et leurs taux
    const agents = await db.agent.findMany();
    const agentRateMap = new Map<string, { directRate: number; centraleRate: number }>();
    for (const a of agents) {
      agentRateMap.set(a.name, {
        directRate: a.defaultDirectRate,
        centraleRate: a.defaultCentraleRate,
      });
    }

    // Récupère toutes les Sale d'octobre 2026 existantes
    const existingSales = await db.sale.findMany({
      where: { year: 2026, month: 10 },
    });
    console.log(`[fix-oct-2026-sales] Found ${existingSales.length} existing Sales for oct 2026`);

    const existingByBl = new Map<string, typeof existingSales[number]>();
    for (const s of existingSales) {
      if (s.blNumber) existingByBl.set(s.blNumber, s);
    }

    // Helper: détermine le type (Direct/Centrale) depuis le nom enseigne
    // Même logique que normalize-enseigne.isCooperativeName
    const isCoop = (name: string): boolean => {
      const n = name.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[''`]/g, '');
      const tokens = ['SCAPEST', 'SCAOUEST', 'SCACHAP', 'SCADIF', 'SCAPNOR', 'SCAPDR', 'SCARA', 'ALDOUEST', 'OTERA', 'COOPERATIVE', 'CENTRA APPROVI', 'FRANPRIX', 'MONOPRIX EXPLOITATION', 'SUPPLY CHAIN'];
      return tokens.some(t => n.includes(t));
    };

    // === Affectation de l'agent : source de vérité = table Enseigne ===
    // L'ERP n'affecte pas systématiquement le commercial à chaque BL (champ souvent
    // vide, surtout sur les 2e commandes du mois — ex AUCHAN MANDELIEU/GRASSE).
    // On ne peut donc PAS se fier au champ "Commercial" du fichier ERP.
    //
    // Règle adoptée (confirmée par l'utilisateur) :
    //   1. Charger toutes les Enseigne en base avec leur agent canonique.
    //   2. Pour chaque BL du fichier, résoudre le nom canonique via
    //      resolveCanonicalName (gère les variantes orthographiques).
    //   3. Si l'enseigne existe en base → utiliser son agent (source de vérité).
    //   4. Sinon → fallback sur le champ Commercial de l'ERP (normalisé KOOK'S si vide).
    //
    // Cas AUCHAN MANDELIEU/GRASSE : 2 BL/mois, un seul avec commercial SEBASTIEN.
    // L'enseigne étant rattachée à SEBASTIEN en base, les 2 BL vont à SEBASTIEN.
    // Total SEBASTIEN = 723.84 + 1447.68 + 459.36 + 487.87 = 3118.75 € HT
    //                  = 3290.27 € TTC (confirmé par l'utilisateur).

    const allEnseignes = await db.enseigne.findMany();
    const enseigneNames = allEnseignes.map(e => e.name);
    const enseigneAgentMap = new Map<string, string>();
    for (const e of allEnseignes) {
      enseigneAgentMap.set(e.name, e.agent);
    }

    // Helper: détermine l'agent à partir du nom du client (priorité Enseigne.agent,
    // fallback sur le commercial ERP normalisé).
    const resolveAgentFromClient = (clientStr: string, commercial: string): { agent: string; canonicalName: string; source: 'enseigne' | 'erp' } => {
      // 1. Résolution du nom canonique contre la base Enseigne
      const { canonicalName, matchedExisting } = resolveCanonicalName(clientStr, enseigneNames);
      if (matchedExisting) {
        const agent = enseigneAgentMap.get(matchedExisting);
        if (agent) {
          return { agent, canonicalName: matchedExisting, source: 'enseigne' };
        }
      }
      // 2. Fallback : champ Commercial ERP normalisé
      const c = (commercial || '').trim();
      const agent = (!c || c === "KOOK'S") ? "KOOK'S" : c;
      return { agent, canonicalName, source: 'erp' };
    };

    // Helper: normalise le commercial fichier -> agent base (legacy, utilisé pour
    // le fallback uniquement)
    const normalizeAgent = (commercial: string): string => {
      const c = (commercial || '').trim();
      if (!c || c === "KOOK'S") return "KOOK'S";
      return c;
    };

    let updated = 0;
    let inserted = 0;
    let agentChanged = 0;
    let htChanged = 0;
    let unchanged = 0;
    let errors = 0;
    const details: Array<{ bl: string; action: string; oldHt?: number; newHt: number; oldAgent?: string; newAgent: string }> = [];

    for (const row of dataRows) {
      const refRaw = row[colRef];
      if (refRaw == null) continue;
      const refStr = String(refRaw).trim();
      if (!refStr) continue;

      const clientStr = String(row[colClient] ?? '').trim();
      const date = parseDateCell(row[colDate]) ?? new Date(2026, 9, 15);
      const htRaw = row[colHT];
      let amountHT = 0;
      if (typeof htRaw === 'number') amountHT = htRaw;
      else if (typeof htRaw === 'string') amountHT = parseFloat(String(htRaw).replace(/\s/g, '').replace(',', '.')) || 0;

      let amountTTC = amountHT;
      if (colTTC) {
        const ttcRaw = row[colTTC];
        if (typeof ttcRaw === 'number') amountTTC = ttcRaw;
        else if (typeof ttcRaw === 'string') amountTTC = parseFloat(String(ttcRaw).replace(/\s/g, '').replace(',', '.')) || amountHT;
      }

      const commercial = colCommercial ? String(row[colCommercial] ?? '').trim() : '';
      // === Source de vérité agent = Enseigne.agent (pas le champ Commercial ERP) ===
      // L'ERP n'affecte pas le commercial à chaque BL → on se fie à l'enseigne.
      const { agent: newAgent, source: agentSource } = resolveAgentFromClient(clientStr, commercial);
      const type = isCoop(clientStr) ? 'Centrale' : 'Direct';

      // Commission au prorata
      let rate = 0;
      if (!isKooksAgent(newAgent)) {
        const r = agentRateMap.get(newAgent);
        if (r) rate = type === 'Direct' ? r.directRate : r.centraleRate;
      }
      const commission = amountHT * rate;

      const existing = existingByBl.get(refStr);

      if (!existing) {
        // BL manquant en base → créer
        try {
          const deduplicationKey = `${refStr}|${newAgent}`;
          await db.sale.create({
            data: {
              blNumber: refStr,
              deduplicationKey,
              date,
              enseigne: clientStr,
              type,
              agent: newAgent,
              amountHT,
              amountTTC,
              rate,
              commission,
              month: 10,
              year: 2026,
            },
          });
          inserted++;
          details.push({ bl: refStr, action: 'INSERT (manquant)', newHt: amountHT, newAgent });
        } catch (e) {
          console.error(`[fix-oct-2026-sales] INSERT failed for ${refStr}:`, e);
          errors++;
        }
        continue;
      }

      // BL existe → vérifier ce qui change
      const oldHt = existing.amountHT;
      const oldAgent = existing.agent;
      const htDiff = Math.abs(oldHt - amountHT) > 0.01;
      const agentDiff = oldAgent !== newAgent;

      if (!htDiff && !agentDiff) {
        unchanged++;
        continue;
      }

      if (agentDiff) {
        // L'agent change → la deduplicationKey change (BL|agent).
        // Il faut supprimer l'ancienne et créer la nouvelle.
        try {
          await db.sale.delete({ where: { id: existing.id } });
          const deduplicationKey = `${refStr}|${newAgent}`;
          await db.sale.create({
            data: {
              blNumber: refStr,
              deduplicationKey,
              date,
              enseigne: clientStr,
              type,
              agent: newAgent,
              amountHT,
              amountTTC,
              rate,
              commission,
              month: 10,
              year: 2026,
            },
          });
          agentChanged++;
          if (htDiff) htChanged++;
          details.push({ bl: refStr, action: 'REPLACE (agent change)', oldHt, newHt: amountHT, oldAgent, newAgent });
        } catch (e) {
          console.error(`[fix-oct-2026-sales] REPLACE failed for ${refStr}:`, e);
          errors++;
        }
        continue;
      }

      // Seul le HT change → update simple
      if (htDiff) {
        try {
          await db.sale.update({
            where: { id: existing.id },
            data: {
              amountHT,
              amountTTC,
              rate,
              commission,
              // Met aussi à jour la date et l'enseigne au cas où
              date,
              enseigne: clientStr,
            },
          });
          htChanged++;
          updated++;
          details.push({ bl: refStr, action: 'UPDATE (HT change)', oldHt, newHt: amountHT, newAgent });
        } catch (e) {
          console.error(`[fix-oct-2026-sales] UPDATE failed for ${refStr}:`, e);
          errors++;
        }
      }
    }

    console.log(`[fix-oct-2026-sales] Done: ${updated} updated, ${inserted} inserted, ${agentChanged} agent-changed, ${htChanged} ht-changed, ${unchanged} unchanged, ${errors} errors`);

    // Vérification finale: total CA HT octobre 2026
    const finalSales = await db.sale.findMany({
      where: { year: 2026, month: 10 },
      select: { amountHT: true, agent: true, blNumber: true },
    });
    const totalHT = finalSales.reduce((s, x) => s + x.amountHT, 0);
    const byAgent = new Map<string, { nb: number; ht: number }>();
    for (const s of finalSales) {
      if (!byAgent.has(s.agent)) byAgent.set(s.agent, { nb: 0, ht: 0 });
      const v = byAgent.get(s.agent)!;
      v.nb++;
      v.ht += s.amountHT;
    }

    return NextResponse.json({
      ok: true,
      result: {
        updated,
        inserted,
        agentChanged,
        htChanged,
        unchanged,
        errors,
        totalSales: finalSales.length,
        totalHT: Math.round(totalHT * 100) / 100,
        byAgent: Array.from(byAgent.entries()).map(([a, v]) => ({
          agent: a,
          nb: v.nb,
          ht: Math.round(v.ht * 100) / 100,
        })),
        detailsSample: details.slice(0, 30),
        detailsCount: details.length,
      },
    });
  } catch (e) {
    console.error('[fix-oct-2026-sales] Error:', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur serveur' },
      { status: 500 }
    );
  }
}
