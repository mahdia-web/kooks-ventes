import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { normalizeEnseigne, similarityScore } from '@/lib/normalize-enseigne';

/**
 * POST /api/enseignes/detect-from-list
 *
 * Body: { names: string[] }
 *
 * Pour une liste de noms d'enseignes (typiquement issus d'un import Excel),
 * retourne pour chaque nom :
 *   - le nom canonique à utiliser (résolu depuis la base existante)
 *   - l'ID de l'enseigne correspondante si elle existe déjà
 *   - le score de confiance (0 si nouveau client)
 *   - un statut: "existing_exact" | "existing_normalized" | "existing_similar" | "new"
 *
 * Permet à l'UI d'import d'afficher AVANT l'import quels noms vont être
 * rattachés à des clients existants — pour validation humaine.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { names } = body as { names: string[] };

    if (!Array.isArray(names)) {
      return NextResponse.json(
        { ok: false, error: 'names (array) requis' },
        { status: 400 }
      );
    }

    // Charge toutes les enseignes existantes
    const existing = await db.enseigne.findMany({
      select: { id: true, name: true, type: true, agent: true },
    });

    type Result = {
      incoming: string;
      canonical: string;
      matchedId: string | null;
      confidence: number;
      status: 'existing_exact' | 'existing_normalized' | 'existing_similar' | 'new';
    };

    const results: Result[] = names.map((incoming) => {
      if (!incoming?.trim()) {
        return { incoming, canonical: '', matchedId: null, confidence: 0, status: 'new' };
      }
      const trimmed = incoming.trim();
      const lower = trimmed.toLowerCase();

      // 1. Exact (case-insensitive)
      const exact = existing.find((e) => e.name.toLowerCase() === lower);
      if (exact) {
        return {
          incoming: trimmed,
          canonical: exact.name,
          matchedId: exact.id,
          confidence: 1,
          status: 'existing_exact',
        };
      }

      // 2. Normalisé identique
      const incomingNorm = normalizeEnseigne(trimmed);
      if (incomingNorm) {
        const normMatch = existing.find((e) => normalizeEnseigne(e.name) === incomingNorm);
        if (normMatch) {
          return {
            incoming: trimmed,
            canonical: normMatch.name,
            matchedId: normMatch.id,
            confidence: 0.95,
            status: 'existing_normalized',
          };
        }
      }

      // 3. Similaire (seuil 0.85)
      let bestMatch: typeof existing[number] | null = null;
      let bestScore = 0;
      for (const e of existing) {
        const score = similarityScore(trimmed, e.name);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = e;
        }
      }
      if (bestMatch && bestScore >= 0.85) {
        return {
          incoming: trimmed,
          canonical: bestMatch.name,
          matchedId: bestMatch.id,
          confidence: bestScore,
          status: 'existing_similar',
        };
      }

      // 4. Nouveau client
      return {
        incoming: trimmed,
        canonical: trimmed,
        matchedId: null,
        confidence: 0,
        status: 'new',
      };
    });

    const summary = {
      total: results.length,
      existingExact: results.filter((r) => r.status === 'existing_exact').length,
      existingNormalized: results.filter((r) => r.status === 'existing_normalized').length,
      existingSimilar: results.filter((r) => r.status === 'existing_similar').length,
      new: results.filter((r) => r.status === 'new').length,
    };

    return NextResponse.json({
      ok: true,
      results,
      summary,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: 'Utilisez POST avec { names: string[] } pour résoudre une liste.',
  });
}
