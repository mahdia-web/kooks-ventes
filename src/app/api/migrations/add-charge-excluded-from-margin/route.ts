import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const maxDuration = 60;

/**
 * POST /api/migrations/add-charge-excluded-from-margin
 *
 * Ajoute la colonne `excludedFromMargin` (BOOLEAN NOT NULL DEFAULT false) à la
 * table `Charge`. Permet le toggle individuel d'une ligne de charge (notamment
 * les salaires) dans le calcul de marge estimée.
 *
 * Idempotent : si la colonne existe déjà, la route renvoie OK sans rien faire.
 */
export async function POST() {
  console.log('[add-charge-excluded-from-margin] Starting migration');

  try {
    // Vérifie l'existence de la colonne (PostgreSQL : information_schema)
    const exists = await db.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'Charge' AND column_name = 'excludedFromMargin'
      ) AS exists
    `;

    if (exists[0]?.exists) {
      console.log('[add-charge-excluded-from-margin] Colonne déjà présente, rien à faire');
      return NextResponse.json({
        ok: true,
        message: 'Colonne excludedFromMargin déjà présente',
        alreadyExists: true,
      });
    }

    // Ajoute la colonne avec valeur par défaut false (toutes les lignes existantes
    // restent incluses dans la marge, comportement inchangé).
    await db.$executeRaw`ALTER TABLE "Charge" ADD COLUMN "excludedFromMargin" BOOLEAN NOT NULL DEFAULT false`;

    console.log('[add-charge-excluded-from-margin] Colonne ajoutée avec succès');
    return NextResponse.json({
      ok: true,
      message: 'Colonne excludedFromMargin ajoutée à la table Charge',
      alreadyExists: false,
    });
  } catch (e: any) {
    console.error('[add-charge-excluded-from-margin] Erreur:', e);
    return NextResponse.json(
      { ok: false, error: e.message || 'Erreur lors de la migration' },
      { status: 500 }
    );
  }
}
