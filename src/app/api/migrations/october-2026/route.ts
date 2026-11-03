import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { octoberSales } from './data';
import { normalizeEnseigne } from '@/lib/normalize-enseigne';

export const maxDuration = 60;

/**
 * POST /api/migrations/october-2026
 *
 * Restaure TOUTES les ventes d'octobre 2026 à partir du fichier ERP de l'utilisateur.
 *
 * Étapes (transaction atomique) :
 *   1. Supprime TOUTES les ventes existantes pour octobre 2026 (year=2026, month=10)
 *   2. Pour chaque ligne (292 au total) :
 *      - Parse la date (DD/MM/YYYY)
 *      - Détermine l'agent : '*' → KOOK'S, 'SEBASTIEN' → 'SEBASTIEN GASNIER'
 *      - Détermine le type (Direct/Centrale) par auto-detection du nom
 *      - Calcule le taux et la commission
 *      - Résout le nom canonique de l'enseigne (anti-doublons intelligent)
 *      - Insère la vente
 *   3. Crée les enseignes manquantes
 *   4. Crée l'agent SEBASTIEN GASNIER s'il n'existe pas
 *
 * Total attendu : 292 ventes, 170 250,64€ HT
 */
export async function POST(_req: NextRequest) {
  console.log('[october-2026] Starting migration — 292 sales expected');

  try {
    // Charge les agents existants et leurs taux
    const allAgents = await db.agent.findMany();
    const agentRateMap = new Map<string, { direct: number; centrale: number }>(
      allAgents.map((a) => [a.name, { direct: a.defaultDirectRate, centrale: a.defaultCentraleRate }])
    );
    const kooksAgent = allAgents.find((a) => /kook/i.test(a.name));
    const kooksName = kooksAgent?.name ?? "KOOK'S";

    // Charge les enseignes existantes (pour résolution canonique)
    const existingEnseignes = await db.enseigne.findMany({ select: { name: true, type: true, agent: true } });
    const existingNames = existingEnseignes.map((e) => e.name);
    const existingNormMap = new Map<string, string>();
    for (const name of existingNames) {
      const n = normalizeEnseigne(name);
      if (n && !existingNormMap.has(n)) existingNormMap.set(n, name);
    }

    // Mots-clés pour auto-détection Centrale
    const centraleKeywords = [
      'otera', 'scapest', 'scachap', 'scaouest', 'aldouest',
      'centra approvi', 'cooperative approvisionnement', 'societe cooperative dapprovi',
      'scadif', 'scapnor', 'lecasud', 'socara', 'renouest', 'scapdr', 'scara',
    ];

    const isCentraleName = (name: string): boolean => {
      const n = normalizeEnseigne(name).toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
      return centraleKeywords.some((kw) => n.includes(kw));
    };

    // Résolution canonique d'enseigne
    const resolveCanonical = (incoming: string): string => {
      if (!incoming?.trim()) return incoming;
      const trimmed = incoming.trim();
      // 1. Match exact case-insensitive
      const exact = existingNames.find((n) => n.toLowerCase() === trimmed.toLowerCase());
      if (exact) return exact;
      // 2. Match par normalisation
      const incomingNorm = normalizeEnseigne(trimmed);
      if (incomingNorm) {
        const normMatch = existingNormMap.get(incomingNorm);
        if (normMatch) return normMatch;
      }
      // 3. Nouveau — on garde le nom tel quel
      return trimmed;
    };

    const result = await db.$transaction(async (tx) => {
      // 1. Crée SEBASTIEN GASNIER s'il n'existe pas
      const sebastienAgent = await tx.agent.findUnique({ where: { name: 'SEBASTIEN GASNIER' } });
      if (!sebastienAgent) {
        await tx.agent.create({
          data: {
            name: 'SEBASTIEN GASNIER',
            defaultDirectRate: 0.07,
            defaultCentraleRate: 0.05,
            isActive: true,
          },
        });
        console.log('[october-2026] Created agent SEBASTIEN GASNIER');
      }

      // 2. Supprime TOUTES les ventes d'octobre 2026
      const deleted = await tx.sale.deleteMany({
        where: { year: 2026, month: 10 },
      });
      console.log(`[october-2026] Deleted ${deleted.count} existing October 2026 sales`);

      // 3. Prépare les ventes à insérer
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
      let skippedZero = 0;

      // === Détection intelligente d'agent ===
      // L'ERP peut déconner et ne pas affecter certaines ventes (marquées `*`).
      // Si l'enseigne est déjà assignée à un agent en base (autre que KOOK'S),
      // on garde cet agent même si l'ERP dit `*`.
      // Ex: AUCHAN MANDELIEU est assignée à SEBASTIEN GASNIER en base →
      //     les ventes `*` pour AUCHAN MANDELIEU seront attribuées à SEBASTIEN GASNIER.
      const enseigneAgentMap = new Map<string, string>();
      const allEnseignesForAgent = await tx.enseigne.findMany({
        select: { name: true, agent: true },
      });
      for (const e of allEnseignesForAgent) {
        if (e.agent && e.agent !== kooksName) {
          enseigneAgentMap.set(e.name.toLowerCase().trim(), e.agent);
        }
      }
      console.log(`[october-2026] Loaded ${enseigneAgentMap.size} enseigne→agent mappings for intelligent detection`);

      let reassignedCount = 0;

      for (const row of octoberSales) {
        // Parse date DD/MM/YYYY
        const m = row.date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (!m) {
          console.warn(`[october-2026] Invalid date: ${row.date} (ref ${row.ref})`);
          continue;
        }
        const day = parseInt(m[1], 10);
        const month = parseInt(m[2], 10);
        const year = parseInt(m[3], 10);
        const date = new Date(year, month - 1, day);

        // Skip zero-amount sales (they're placeholders)
        if (row.ht === 0) {
          skippedZero++;
          continue;
        }

        // Résolution canonique de l'enseigne (avant la résolution agent)
        const enseigne = resolveCanonical(row.client);

        // Résolution agent INTELLIGENTE
        let agent: string;
        if (row.commercial === '*' || !row.commercial) {
          // L'ERP n'a pas affecté d'agent → vérifie si l'enseigne est déjà assignée
          const existingAgent = enseigneAgentMap.get(enseigne.toLowerCase().trim());
          if (existingAgent) {
            // L'enseigne est déjà assignée à un agent spécifique → on garde cet agent
            agent = existingAgent;
            reassignedCount++;
            console.log(`[october-2026] Reassigned: ${enseigne} → ${agent} (was *, detected from Enseigne table)`);
          } else {
            agent = kooksName;
          }
        } else if (/sebastien/i.test(row.commercial)) {
          agent = 'SEBASTIEN GASNIER';
        } else {
          agent = row.commercial;
        }

        // Détermination du type
        const type = isCentraleName(enseigne) ? 'Centrale' : 'Direct';

        // Taux
        const agentDefaults = agentRateMap.get(agent) ?? { direct: 0.07, centrale: 0.05 };
        const rate = agent === kooksName ? 0 : (type === 'Centrale' ? agentDefaults.centrale : agentDefaults.direct);
        const commission = row.ht * rate;

        const blNumber = row.ref;
        const deduplicationKey = `${blNumber}|${agent}`;

        toInsert.push({
          blNumber,
          deduplicationKey,
          date,
          enseigne,
          type,
          agent,
          amountHT: row.ht,
          amountTTC: row.ttc,
          rate,
          commission,
          month: date.getMonth() + 1,
          year: date.getFullYear(),
        });

        // Track new enseignes
        if (!existingNames.includes(enseigne) && !newEnseignes.has(enseigne)) {
          newEnseignes.set(enseigne, { name: enseigne, type, agent });
        }
      }

      console.log(`[october-2026] Prepared ${toInsert.length} sales (${skippedZero} skipped as 0€)`);

      // 4. Insère les ventes en batches
      const BATCH_SIZE = 100;
      let inserted = 0;
      for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
        const batch = toInsert.slice(i, i + BATCH_SIZE);
        try {
          const res = await tx.sale.createMany({ data: batch, skipDuplicates: true });
          inserted += res.count;
        } catch (e) {
          console.error(`[october-2026] Batch ${i} failed:`, e);
          // Fallback: insert one by one
          for (const v of batch) {
            try {
              await tx.sale.create({ data: v });
              inserted++;
            } catch {}
          }
        }
      }
      console.log(`[october-2026] Inserted ${inserted} sales`);

      // 5. Crée les nouvelles enseignes
      let enseignesCreated = 0;
      for (const [name, data] of newEnseignes.entries()) {
        try {
          await tx.enseigne.create({ data: { name, type: data.type, agent: data.agent, isActive: true } });
          enseignesCreated++;
        } catch {
          // Already exists (race condition) — ignore
        }
      }
      console.log(`[october-2026] Created ${enseignesCreated} new enseignes`);

      // 6. Calcule le CA total inséré
      const totalCA = toInsert.reduce((s, v) => s + v.amountHT, 0);

      return {
        deletedCount: deleted.count,
        insertedCount: inserted,
        skippedZero,
        enseignesCreated,
        reassignedCount,
        totalCA,
        expectedCA: 170250.64,
        difference: totalCA - 170250.64,
      };
    });

    console.log('[october-2026] Migration successful:', result);

    return NextResponse.json({
      ok: true,
      ...result,
      message: `Restauration terminée : ${result.insertedCount} ventes insérées${result.reassignedCount > 0 ? ` (${result.reassignedCount} réaffectées intelligemment)` : ''}. CA: ${result.totalCA.toFixed(2)}€`,
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    console.error('[october-2026] Error:', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

export async function GET() {
  const totalHT = octoberSales.reduce((s, r) => s + r.ht, 0);
  return NextResponse.json({
    ok: true,
    message: 'Utilisez POST pour restaurer les ventes d\'octobre 2026',
    salesCount: octoberSales.length,
    totalHT,
    byAgent: octoberSales.reduce((acc, r) => {
      const key = r.commercial === '*' ? 'KOOK\'S' : r.commercial;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>),
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
