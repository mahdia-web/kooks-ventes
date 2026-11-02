import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * POST /api/enseignes/merge
 *
 * Fusionne un groupe d'enseignes dupliquées en une seule enseigne canonique.
 *
 * Body:
 *   {
 *     "canonicalId": "cmux...",        // L'ID de l'enseigne à garder (canonique)
 *     "duplicateIds": ["cmux...", ...] // Les IDs à fusionner dans la canonique
 *   }
 *
 * Étapes:
 *   1. Pour chaque doublon :
 *      - Update bulk des ventes avec le nom canonique, type, agent, rate
 *      - Update bulk des volumes avec le nom canonique
 *      - Update bulk des charges directes avec le nom canonique
 *      - Update bulk des tarifs produits avec le nom canonique
 *      - Recalcul SQL natif de commission = amountHT * rate (une seule passe par doublon)
 *      - Si le doublon et le canonique ont le même nom (insensible à la casse),
 *        on fusionne juste les métadonnées sans toucher aux ventes.
 *   2. Supprimer l'enseigne doublon (les ventes sont déjà re-rattachées au canonique)
 *   3. L'enseigne canonique reste avec son id, son nom, son type, son agent
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { canonicalId, duplicateIds } = body as {
      canonicalId: string;
      duplicateIds: string[];
    };

    if (!canonicalId || !Array.isArray(duplicateIds) || duplicateIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'canonicalId et duplicateIds (array non vide) requis' },
        { status: 400 }
      );
    }

    // Récupère l'enseigne canonique
    const canonical = await db.enseigne.findUnique({ where: { id: canonicalId } });
    if (!canonical) {
      return NextResponse.json(
        { ok: false, error: 'Enseigne canonique introuvable' },
        { status: 404 }
      );
    }

    // Récupère les doublons
    const duplicates = await db.enseigne.findMany({
      where: { id: { in: duplicateIds } },
    });
    if (duplicates.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Aucun doublon trouvé avec ces IDs' },
        { status: 404 }
      );
    }

    // Calcule le taux canonique (basé sur le type de l'enseigne canonique)
    // Règle Kooks : 7% Direct, 5% Centrale, 0% CHR
    const canonicalRate =
      canonical.commissionRate ??
      (canonical.type === 'CHR' ? 0 :
       canonical.type === 'Centrale' ? 0.05 : 0.07);

    console.log(`[merge] canonical=${canonical.name} rate=${canonicalRate} duplicates=${duplicates.length}`);

    let totalSalesUpdated = 0;
    let totalVolumesUpdated = 0;
    let totalChargesUpdated = 0;
    let totalPricesUpdated = 0;
    const mergedNames: string[] = [];

    // Transaction : toutes les updates sont atomiques — si une échoue, tout est annulé
    await db.$transaction(async (tx) => {
      for (const dup of duplicates) {
        const dupName = dup.name;
        const canonicalName = canonical.name;

        console.log(`[merge] Processing dup: ${dupName} → ${canonicalName}`);

        // Cas spécial : si le doublon a un nom identique (cas pathologique),
        // skip — l'enseigne sera supprimée sans toucher aux ventes.
        if (dupName === canonicalName) {
          await tx.enseigne.delete({ where: { id: dup.id } });
          mergedNames.push(dupName);
          continue;
        }

        // 1. Update bulk des ventes : rename + type + agent + rate (en 1 requête)
        const salesResult = await tx.sale.updateMany({
          where: { enseigne: dupName },
          data: {
            enseigne: canonicalName,
            type: canonical.type,
            agent: canonical.agent,
            rate: canonicalRate,
          },
        });
        totalSalesUpdated += salesResult.count;
        console.log(`[merge]   sales updated: ${salesResult.count}`);

        // 2. Update bulk des volumes
        const volumesResult = await tx.volumeSale.updateMany({
          where: { enseigne: dupName },
          data: { enseigne: canonicalName },
        });
        totalVolumesUpdated += volumesResult.count;

        // 3. Update bulk des charges directes
        const chargesResult = await tx.charge.updateMany({
          where: { enseigne: dupName },
          data: { enseigne: canonicalName },
        });
        totalChargesUpdated += chargesResult.count;

        // 4. Update bulk des tarifs produits
        const pricesResult = await tx.productSalesPrice.updateMany({
          where: { enseigne: dupName },
          data: { enseigne: canonicalName },
        });
        totalPricesUpdated += pricesResult.count;

        // 5. Recalcul commission pour les ventes fusionnées
        //    On utilise updateMany avec Prisma (pas de SQL raw pour éviter
        //    les soucis de casse de colonnes sur Supabase/PostgreSQL)
        //    Commission = amountHT * rate — calculé en JS puis bulk update
        //    Pour rester performant, on récupère les ventes à mettre à jour
        //    puis on fait un update groupé.
        const salesToRecompute = await tx.sale.findMany({
          where: { enseigne: canonicalName, agent: canonical.agent, rate: canonicalRate },
          select: { id: true, amountHT: true },
        });
        for (const s of salesToRecompute) {
          await tx.sale.update({
            where: { id: s.id },
            data: { commission: s.amountHT * canonicalRate },
          });
        }
        console.log(`[merge]   commissions recomputed: ${salesToRecompute.length}`);

        // 6. Supprime l'enseigne doublon (les ventes sont déjà re-rattachées)
        await tx.enseigne.delete({ where: { id: dup.id } });
        mergedNames.push(dupName);
        console.log(`[merge]   deleted dup enseigne: ${dupName}`);
      }
    }); // fin transaction

    console.log(`[merge] Done: ${duplicates.length} merged, ${totalSalesUpdated} sales updated`);

    return NextResponse.json({
      ok: true,
      canonical: canonical.name,
      deletedCount: duplicates.length,
      salesUpdated: totalSalesUpdated,
      volumesUpdated: totalVolumesUpdated,
      chargesUpdated: totalChargesUpdated,
      pricesUpdated: totalPricesUpdated,
      mergedNames,
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    console.error('[merge] Error:', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
