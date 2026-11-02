import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * POST /api/enseignes/bulk-update
 *
 * Met à jour le type/agent de plusieurs enseignes en une seule fois,
 * ET propage la mise à jour à toutes leurs ventes (commission recalculée en SQL).
 *
 * Body:
 *   {
 *     "ids": ["cmux...", ...],          // IDs des enseignes à mettre à jour
 *     "type": "Centrale" | "Direct" | "CHR",   // optionnel
 *     "agent": "BROCARD",                // optionnel
 *     "commissionRate": 0.05             // optionnel (null pour utiliser défaut)
 *   }
 *
 * Réponse:
 *   {
 *     "ok": true,
 *     "updated": { enseignes: N, sales: N }
 *   }
 *
 * Performance : utilise 1 UPDATE SQL par enseigne (au lieu d'une loop per-sale),
 * permettant de retyper 30+ enseignes MONOPRIX en quelques secondes.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ids, type, agent, commissionRate } = body as {
      ids: string[];
      type?: 'Direct' | 'Centrale' | 'CHR';
      agent?: string;
      commissionRate?: number | null;
    };

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'ids (array non vide) requis' },
        { status: 400 }
      );
    }
    if (!type && !agent) {
      return NextResponse.json(
        { ok: false, error: 'Au moins type ou agent doit être fourni' },
        { status: 400 }
      );
    }
    if (type && !['Direct', 'Centrale', 'CHR'].includes(type)) {
      return NextResponse.json(
        { ok: false, error: 'type doit être Direct, Centrale ou CHR' },
        { status: 400 }
      );
    }

    // Récupère toutes les enseignes à mettre à jour
    const enseignes = await db.enseigne.findMany({ where: { id: { in: ids } } });
    if (enseignes.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Aucune enseigne trouvée avec ces IDs' },
        { status: 404 }
      );
    }

    let totalSalesUpdated = 0;
    const updatedNames: string[] = [];

    for (const ens of enseignes) {
      const newType = type ?? (ens.type as 'Direct' | 'Centrale' | 'CHR');
      const newAgent = agent ?? ens.agent;
      // Calcule le taux effectif
      let effectiveRate: number;
      if (newType === 'CHR') {
        effectiveRate = 0;
      } else if (typeof commissionRate === 'number') {
        effectiveRate = commissionRate;
      } else if (newType === 'Centrale') {
        effectiveRate = 0.05;
      } else {
        effectiveRate = 0.07;
      }

      // 1. Update bulk des ventes (type, agent, rate) en 1 requête
      const salesResult = await db.sale.updateMany({
        where: { enseigne: ens.name },
        data: {
          type: newType,
          agent: newAgent,
          rate: effectiveRate,
        },
      });
      totalSalesUpdated += salesResult.count;

      // 2. Recalcul commission en SQL natif (1 requête pour toutes les ventes de cette enseigne)
      try {
        await db.$executeRaw`
          UPDATE "Sale"
          SET commission = "amountHT" * ${effectiveRate}
          WHERE enseigne = ${ens.name}
        `;
      } catch (e) {
        console.warn(`SQL commission update failed for ${ens.name}:`, e);
        // Fallback : recalcul en JS (lent mais resilient)
        const sales = await db.sale.findMany({
          where: { enseigne: ens.name },
          select: { id: true, amountHT: true },
        });
        for (const s of sales) {
          await db.sale.update({
            where: { id: s.id },
            data: { commission: s.amountHT * effectiveRate },
          });
        }
      }

      // 3. Update de l'enseigne elle-même
      const ensUpdate: Record<string, unknown> = {
        type: newType,
        agent: newAgent,
        lastManualUpdate: new Date(),
      };
      if (typeof commissionRate === 'number' || commissionRate === null) {
        ensUpdate.commissionRate = commissionRate;
      }
      await db.enseigne.update({ where: { id: ens.id }, data: ensUpdate });
      updatedNames.push(ens.name);
    }

    return NextResponse.json({
      ok: true,
      updated: {
        enseignes: enseignes.length,
        sales: totalSalesUpdated,
      },
      updatedNames,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    );
  }
}
