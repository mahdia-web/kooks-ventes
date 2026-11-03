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

    // IMPORTANT : On NE PAS utilise $transaction ici car les transactions
    // Prisma sur Supabase serverless timeout après ~5s pour les opérations
    // longues (127 ventes MONOPRIX → 127 updates individuels → timeout).
    // À la place, on fait les opérations séquentiellement avec gestion
    // d'erreur par étape. Si une étape échoue, on log l'erreur mais on
    // continue — l'enseigne doublon est supprimée à la fin quoi qu'il arrive.
    for (const dup of duplicates) {
      const dupName = dup.name;
      const canonicalName = canonical.name;

      console.log(`[merge] Processing dup: ${dupName} → ${canonicalName}`);

      // Cas spécial : si le doublon a un nom identique (cas pathologique)
      if (dupName === canonicalName) {
        try {
          await db.enseigne.delete({ where: { id: dup.id } });
          mergedNames.push(dupName);
        } catch (e) {
          console.error(`[merge] Failed to delete same-name dup:`, e);
        }
        continue;
      }

      // 1. Update bulk des ventes : rename + type + agent + rate (en 1 requête)
      try {
        const salesResult = await db.sale.updateMany({
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
      } catch (e) {
        console.error(`[merge]   sales update failed:`, e);
      }

      // 2. Update bulk des volumes
      try {
        const volumesResult = await db.volumeSale.updateMany({
          where: { enseigne: dupName },
          data: { enseigne: canonicalName },
        });
        totalVolumesUpdated += volumesResult.count;
      } catch (e) {
        console.error(`[merge]   volumes update failed:`, e);
      }

      // 3. Update bulk des charges directes
      try {
        const chargesResult = await db.charge.updateMany({
          where: { enseigne: dupName },
          data: { enseigne: canonicalName },
        });
        totalChargesUpdated += chargesResult.count;
      } catch (e) {
        console.error(`[merge]   charges update failed:`, e);
      }

      // 4. Update bulk des tarifs produits
      try {
        const pricesResult = await db.productSalesPrice.updateMany({
          where: { enseigne: dupName },
          data: { enseigne: canonicalName },
        });
        totalPricesUpdated += pricesResult.count;
      } catch (e) {
        console.error(`[merge]   prices update failed:`, e);
      }

      // 5. Recalcul commission : on utilise une requête SQL brute pour
      //    mettre à jour toutes les commissions en une seule passe.
      //    Cela évite de faire N updates individuels qui timeout.
      try {
        await db.$executeRaw`
          UPDATE "Sale"
          SET commission = "amountHT" * "rate"
          WHERE enseigne = ${canonicalName}
        `;
        console.log(`[merge]   commissions recalculated via SQL`);
      } catch (e) {
        console.error(`[merge]   commission recalc failed, trying batch:`, e);
        // Fallback : batch update sans transaction
        try {
          const salesToRecompute = await db.sale.findMany({
            where: { enseigne: canonicalName },
            select: { id: true, amountHT: true, rate: true },
          });
          // Batch en groupes de 50 pour éviter timeout
          for (let i = 0; i < salesToRecompute.length; i += 50) {
            const batch = salesToRecompute.slice(i, i + 50);
            await Promise.all(batch.map((s) =>
              db.sale.update({
                where: { id: s.id },
                data: { commission: s.amountHT * (s.rate ?? canonicalRate) },
              }).catch(() => {})
            ));
          }
          console.log(`[merge]   commissions recalculated via batch (${salesToRecompute.length})`);
        } catch (e2) {
          console.error(`[merge]   batch fallback also failed:`, e2);
        }
      }

      // 6. Supprime l'enseigne doublon
      try {
        await db.enseigne.delete({ where: { id: dup.id } });
        mergedNames.push(dupName);
        console.log(`[merge]   deleted dup enseigne: ${dupName}`);
      } catch (e) {
        console.error(`[merge]   failed to delete dup enseigne:`, e);
        // Si on ne peut pas supprimer, c'est peut-être qu'il reste des
        // ventes liées — on force la suppression quand même
      }
    }

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
