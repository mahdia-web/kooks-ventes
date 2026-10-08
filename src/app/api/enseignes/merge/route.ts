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
 *      - Mettre à jour toutes les ventes avec `enseigne = dup.name` → `enseigne = canonical.name`
 *      - Mettre à jour toutes les ventes : `agent = canonical.agent`, `type = canonical.type`
 *      - Recalculer `rate` et `commission` basé sur le type canonique
 *   2. Supprimer l'enseigne doublon
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
    // Règle Kooks : 7% Direct, 5% Centrale
    const canonicalRate =
      canonical.commissionRate ??
      (canonical.type === 'Centrale' ? 0.05 : 0.07);

    let totalSalesUpdated = 0;
    const mergedNames: string[] = [];

    for (const dup of duplicates) {
      // Met à jour toutes les ventes du doublon pour pointer vers le canonique
      const result = await db.sale.updateMany({
        where: { enseigne: dup.name },
        data: {
          enseigne: canonical.name,
          type: canonical.type,
          agent: canonical.agent,
          rate: canonicalRate,
          // Recalcule la commission pour chaque vente (commission = amountHT × rate)
          // Remarque : updateMany ne permet pas d'expressions, donc on doit faire
          // une 2e passe pour recalculer commission vente par vente.
        },
      });
      totalSalesUpdated += result.count;
      mergedNames.push(dup.name);

      // Recalcule la commission pour chaque vente mise à jour
      // (on ne peut pas le faire en une seule requête updateMany)
      const salesToUpdate = await db.sale.findMany({
        where: { enseigne: canonical.name, agent: canonical.agent },
        select: { id: true, amountHT: true },
      });
      for (const s of salesToUpdate) {
        await db.sale.update({
          where: { id: s.id },
          data: { commission: s.amountHT * canonicalRate },
        });
      }

      // Supprime l'enseigne doublon
      await db.enseigne.delete({ where: { id: dup.id } });
    }

    return NextResponse.json({
      ok: true,
      canonical: canonical.name,
      deletedCount: duplicates.length,
      salesUpdated: totalSalesUpdated,
      mergedNames,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    );
  }
}
