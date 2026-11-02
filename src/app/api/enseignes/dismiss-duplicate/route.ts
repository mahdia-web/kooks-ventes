import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * POST /api/enseignes/dismiss-duplicate
 *
 * Marque un groupe d'enseignes comme "PAS un doublon" — l'utilisateur a validé
 * que ce sont bien des magasins distincts (par exemple deux magasins AUCHAN
 * dans des villes différentes : AUCHAN SEMECOURT ≠ AUCHAN MANDELIEU).
 *
 * Body:
 *   {
 *     "ids": ["cmux...", "cmux..."],   // IDs des enseignes du groupe
 *     "reason": "Magasins physiques distincts"  // optionnel
 *   }
 *
 * Stockage : on utilise la table Parameter avec la clé `dismissedDuplicateGroups`.
 * La valeur est un JSON array de signatures. Une signature = IDs triés join "|".
 *
 * Le endpoint GET /api/enseignes/detect-duplicates filtre ensuite les groupes
 * dont la signature est dans cette liste.
 *
 * Aussi : GET renvoie la liste des groupes dismissés (pour affichage / undo).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ids, reason } = body as { ids: string[]; reason?: string };

    console.log(`[dismiss-duplicate] POST received ids=${JSON.stringify(ids)} reason=${reason || '(none)'}`);

    if (!Array.isArray(ids) || ids.length < 2) {
      return NextResponse.json(
        { ok: false, error: 'ids (array de 2+ éléments) requis' },
        { status: 400 }
      );
    }

    // Vérifie que les enseignes existent
    const enseignes = await db.enseigne.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    console.log(`[dismiss-duplicate] Found ${enseignes.length} enseignes for ${ids.length} ids`);
    if (enseignes.length < 2) {
      return NextResponse.json(
        { ok: false, error: 'Au moins 2 enseignes doivent exister avec ces IDs' },
        { status: 404 }
      );
    }

    // Signature stable : IDs triés join "|"
    const signature = enseignes.map((e) => e.id).sort().join('|');
    console.log(`[dismiss-duplicate] Computed signature: ${signature}`);

    // Charge la liste actuelle
    const existing = await db.parameter.findUnique({
      where: { key: 'dismissedDuplicateGroups' },
    });
    let list: Array<{ signature: string; ids: string[]; names: string[]; reason?: string; dismissedAt: string }> = [];
    if (existing) {
      try {
        list = JSON.parse(existing.value);
        if (!Array.isArray(list)) list = [];
      } catch {
        list = [];
      }
    }
    console.log(`[dismiss-duplicate] Existing dismissed list: ${list.length} entries`);

    // Évite les doublons
    if (!list.some((e) => e.signature === signature)) {
      list.push({
        signature,
        ids: enseignes.map((e) => e.id),
        names: enseignes.map((e) => e.name),
        reason: reason || 'Marqué comme non-doublon par l\'utilisateur',
        dismissedAt: new Date().toISOString(),
      });

      // Transaction : écrit + vérifie que ça a bien été persisté
      await db.$transaction(async (tx) => {
        await tx.parameter.upsert({
          where: { key: 'dismissedDuplicateGroups' },
          create: { key: 'dismissedDuplicateGroups', value: JSON.stringify(list) },
          update: { value: JSON.stringify(list) },
        });

        // Vérification : relit immédiatement pour confirmer l'écriture
        const verify = await tx.parameter.findUnique({
          where: { key: 'dismissedDuplicateGroups' },
        });
        if (!verify || !verify.value.includes(signature)) {
          throw new Error(`Échec persistance : signature ${signature} non trouvée après écriture`);
        }
        console.log(`[dismiss-duplicate] Verified: signature persisted (length=${verify.value.length})`);
      });
    } else {
      console.log(`[dismiss-duplicate] Signature already in dismissed list — skipping`);
    }

    return NextResponse.json({
      ok: true,
      dismissed: {
        signature,
        names: enseignes.map((e) => e.name),
        reason,
      },
      totalDismissed: list.length,
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    console.error('[dismiss-duplicate] POST error:', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

/**
 * GET /api/enseignes/dismiss-duplicate
 * Renvoie la liste des groupes marqués comme "pas un doublon".
 */
export async function GET() {
  try {
    const existing = await db.parameter.findUnique({
      where: { key: 'dismissedDuplicateGroups' },
    });
    if (!existing) {
      return NextResponse.json({ ok: true, data: [] });
    }
    let list: any[] = [];
    try {
      list = JSON.parse(existing.value);
      if (!Array.isArray(list)) list = [];
    } catch {
      list = [];
    }
    return NextResponse.json({ ok: true, data: list });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/enseignes/dismiss-duplicate?signature=xxx
 * Annule un dismiss (restore le groupe dans la détection).
 */
export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const signature = url.searchParams.get('signature');
    if (!signature) {
      return NextResponse.json(
        { ok: false, error: 'signature requis en query param' },
        { status: 400 }
      );
    }
    const existing = await db.parameter.findUnique({
      where: { key: 'dismissedDuplicateGroups' },
    });
    if (!existing) {
      return NextResponse.json({ ok: true, restored: false });
    }
    let list: any[] = [];
    try {
      list = JSON.parse(existing.value);
      if (!Array.isArray(list)) list = [];
    } catch {
      list = [];
    }
    const newList = list.filter((e) => e.signature !== signature);
    await db.parameter.update({
      where: { key: 'dismissedDuplicateGroups' },
      data: { value: JSON.stringify(newList) },
    });
    return NextResponse.json({
      ok: true,
      restored: newList.length < list.length,
      totalDismissed: newList.length,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    );
  }
}
