import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/volumes/clients
 * Retourne TOUS les noms de clients distincts présents dans la table VolumeSale.
 * Utilisé pour remplir le dropdown de filtre client sur la page /volumes
 * (l'endpoint /api/volumes/stats ne renvoie que le top 20).
 */
export async function GET() {
  try {
    const result = await db.volumeSale.findMany({
      select: { enseigne: true },
      distinct: ['enseigne'],
      orderBy: { enseigne: 'asc' },
    });
    const names = result.map((r) => r.enseigne).filter(Boolean);
    return NextResponse.json({ ok: true, data: names });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    );
  }
}
