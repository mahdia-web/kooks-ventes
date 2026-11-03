import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * POST /api/enseignes/sync-agents
 *
 * Synchronise l'agent des ventes avec l'agent de l'enseigne.
 *
 * Problème : quand on restaure les ventes d'un mois (ex: octobre 2026),
 * les ventes anciennes (septembre, août...) gardent l'ancien agent.
 * Résultat : SCAOUEST apparaît chez BROCARD (anciennes ventes) alors que
 * ses ventes récentes sont chez CAP FRAIS.
 *
 * Solution : pour chaque enseigne, on prend l'agent de la vente la plus
 * récente (qui est la source de vérité — issue de l'ERP), et on :
 *   1. Met à jour l'Enseigne.agent avec cet agent
 *   2. Met à jour TOUTES les ventes de cette enseigne avec cet agent
 *   3. Recalcule les commissions (rate + commission) en fonction du
 *      nouvel agent et du type de vente
 *
 * Body optionnel :
 *   { "dryRun": true } → simule sans modifier, retourne le rapport
 *   { "enseigneFilter": "SCAOUEST" } → limite à une enseigne spécifique
 *
 * Réponse :
 *   {
 *     ok: true,
 *     synced: Array<{ enseigne, oldAgent, newAgent, salesUpdated, caTotal }>,
 *     totalSynced: number,
 *     totalSalesUpdated: number
 *   }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun === true;
    const enseigneFilter = body.enseigneFilter as string | undefined;

    console.log(`[sync-agents] Starting ${dryRun ? 'DRY RUN' : 'sync'}${enseigneFilter ? ` for "${enseigneFilter}"` : ''}`);

    // 1. Charge tous les agents et leurs taux
    const allAgents = await db.agent.findMany();
    const agentRateMap = new Map<string, { direct: number; centrale: number }>(
      allAgents.map((a) => [a.name, { direct: a.defaultDirectRate, centrale: a.defaultCentraleRate }])
    );
    const kooksAgent = allAgents.find((a) => /kook/i.test(a.name));
    const kooksName = kooksAgent?.name ?? "KOOK'S";

    // 2. Pour chaque enseigne, trouve l'agent de la vente la plus récente
    //    (la vente la plus récente est la source de vérité — elle vient de
    //     l'import ERP le plus récent)
    const enseignes = await db.enseigne.findMany({
      where: enseigneFilter
        ? { name: { contains: enseigneFilter, mode: 'insensitive' } }
        : {},
      select: { id: true, name: true, type: true, agent: true },
    });

    console.log(`[sync-agents] Found ${enseignes.length} enseignes to check`);

    const syncReport: Array<{
      enseigne: string;
      oldAgent: string;
      newAgent: string;
      salesUpdated: number;
      caTotal: number;
    }> = [];

    let totalSalesUpdated = 0;
    let totalSynced = 0;

    for (const ens of enseignes) {
      // Trouve la vente la plus récente pour cette enseigne
      const latestSale = await db.sale.findFirst({
        where: { enseigne: ens.name },
        orderBy: { date: 'desc' },
        select: { agent: true, date: true, type: true },
      });

      if (!latestSale) {
        // Pas de vente → skip
        continue;
      }

      const newAgent = latestSale.agent;

      // Si l'agent de la vente la plus récente est différent de l'agent actuel
      // de l'enseigne, on a un problème de liaison
      if (newAgent === ens.agent) {
        // L'enseigne a déjà le bon agent — vérifions quand même si toutes
        // les ventes ont le même agent
        const mixedAgentSales = await db.sale.count({
          where: { enseigne: ens.name, NOT: { agent: newAgent } },
        });
        if (mixedAgentSales === 0) {
          // Tout est cohérent — skip
          continue;
        }
        // Sinon, on continue pour fixer les ventes mixtes
      }

      // Compte les ventes à mettre à jour
      const salesToUpdate = await db.sale.count({
        where: { enseigne: ens.name, NOT: { agent: newAgent } },
      });

      // Calcule le CA total de cette enseigne
      const caAgg = await db.sale.aggregate({
        where: { enseigne: ens.name },
        _sum: { amountHT: true },
      });
      const caTotal = caAgg._sum.amountHT ?? 0;

      if (salesToUpdate === 0 && newAgent === ens.agent) {
        continue;
      }

      syncReport.push({
        enseigne: ens.name,
        oldAgent: ens.agent,
        newAgent,
        salesUpdated: salesToUpdate,
        caTotal,
      });

      if (dryRun) {
        console.log(`[sync-agents] DRY RUN: ${ens.name} agent ${ens.agent} → ${newAgent} (${salesToUpdate} sales to update)`);
        continue;
      }

      // Détermine le type effectif (on garde le type de l'enseigne)
      const type = ens.type === 'Centrale' ? 'Centrale' : ens.type === 'CHR' ? 'CHR' : 'Direct';

      // Calcule le taux effectif selon le nouvel agent
      const agentDefaults = agentRateMap.get(newAgent) ?? { direct: 0.07, centrale: 0.05 };
      const newRate = newAgent === kooksName
        ? 0
        : type === 'CHR'
        ? 0
        : type === 'Centrale'
        ? agentDefaults.centrale
        : agentDefaults.direct;

      // Transaction: update enseigne + update all sales + recompute commission
      await db.$transaction(async (tx) => {
        // 1. Update l'enseigne
        await tx.enseigne.update({
          where: { id: ens.id },
          data: { agent: newAgent, lastManualUpdate: new Date() },
        });

        // 2. Update toutes les ventes (agent + type + rate)
        const updateResult = await tx.sale.updateMany({
          where: { enseigne: ens.name },
          data: { agent: newAgent, type, rate: newRate },
        });

        // 3. Recalcule commission pour chaque vente
        const sales = await tx.sale.findMany({
          where: { enseigne: ens.name },
          select: { id: true, amountHT: true },
        });
        for (const s of sales) {
          await tx.sale.update({
            where: { id: s.id },
            data: { commission: s.amountHT * newRate },
          });
        }

        totalSalesUpdated += updateResult.count;
        console.log(`[sync-agents] ${ens.name}: agent ${ens.agent} → ${newAgent}, ${updateResult.count} sales updated, rate=${newRate}`);
      });

      totalSynced++;
    }

    console.log(`[sync-agents] Done: ${totalSynced} enseignes synced, ${totalSalesUpdated} sales updated`);

    return NextResponse.json({
      ok: true,
      dryRun,
      synced: syncReport,
      totalSynced,
      totalSalesUpdated,
      message: dryRun
        ? `${syncReport.length} enseigne(s) nécessitent une synchronisation (${totalSalesUpdated} ventes à mettre à jour). Lancez sans dryRun pour appliquer.`
        : `${totalSynced} enseigne(s) synchronisée(s), ${totalSalesUpdated} ventes mises à jour.`,
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    console.error('[sync-agents] Error:', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

/**
 * GET /api/enseignes/sync-agents
 * Retourne un aperçu des incohérences agent entre enseignes et ventes.
 */
export async function GET() {
  try {
    // Pour chaque enseigne, compare l'agent de l'enseigne avec l'agent
    // de la vente la plus récente
    const enseignes = await db.enseigne.findMany({
      select: { id: true, name: true, type: true, agent: true },
      orderBy: { name: 'asc' },
    });

    const inconsistencies: Array<{
      enseigne: string;
      enseigneAgent: string;
      latestSaleAgent: string;
      latestSaleDate: string;
      mixedAgentsCount: number;
      mixedAgents: string[];
      totalSales: number;
      totalCA: number;
    }> = [];

    for (const ens of enseignes) {
      const latestSale = await db.sale.findFirst({
        where: { enseigne: ens.name },
        orderBy: { date: 'desc' },
        select: { agent: true, date: true },
      });

      if (!latestSale) continue;

      // Compte les ventes par agent
      const byAgentAgg = await db.sale.groupBy({
        by: ['agent'],
        where: { enseigne: ens.name },
        _count: { _all: true },
        _sum: { amountHT: true },
      });

      const mixedAgents = byAgentAgg.map((a) => a.agent);
      const mixedAgentsCount = mixedAgents.length;
      const totalSales = byAgentAgg.reduce((s, a) => s + a._count._all, 0);
      const totalCA = byAgentAgg.reduce((s, a) => s + (a._sum.amountHT ?? 0), 0);

      // Incohérence si : l'agent de l'enseigne ≠ agent de la dernière vente
      // OU il y a plusieurs agents différents dans les ventes
      if (ens.agent !== latestSale.agent || mixedAgentsCount > 1) {
        inconsistencies.push({
          enseigne: ens.name,
          enseigneAgent: ens.agent,
          latestSaleAgent: latestSale.agent,
          latestSaleDate: latestSale.date.toISOString().split('T')[0],
          mixedAgentsCount,
          mixedAgents,
          totalSales,
          totalCA,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      totalEnseignes: enseignes.length,
      inconsistenciesCount: inconsistencies.length,
      inconsistencies: inconsistencies.sort((a, b) => b.totalCA - a.totalCA),
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    console.error('[sync-agents GET] Error:', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
