import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { reclassifyByVendor, knownVendors } from '@/lib/vendor-rules';
import { isChargeDirecte } from '@/lib/compte-comptable';

export const maxDuration = 60;

/**
 * POST /api/charges/reclassify
 *
 * Reclassifie en lot les charges existantes en se basant sur le nom du
 * fournisseur (cf. src/lib/vendor-rules.ts). Corrige les mauvaises
 * catégorisations dues au numéro de compte comptable (ex: SARL AGENCE
 * BROCARD classé "Frais bancaires" alors que c'est une commission d'agent).
 *
 * Recalcule aussi allocationMethod (DIRECT / GLOBAL) après reclassification,
 * car Transport & Marketing sont désormais considérés comme charges directes.
 *
 * Body optionnel:
 *   { "dryRun": true }  → renvoie ce qui serait changé sans modifier la base
 *
 * Réponse:
 *   { ok, reclassified: number, scanned: number, byCategory: {...}, dryRun }
 */
export async function POST(req: NextRequest) {
  try {
    let dryRun = false;
    try {
      const body = await req.json();
      dryRun = !!body?.dryRun;
    } catch {
      // Body vide / JSON invalide → dryRun = false
    }

    const charges = await db.charge.findMany({
      select: { id: true, vendor: true, category: true, allocationMethod: true, amountHT: true },
    });

    let reclassified = 0;
    let allocationChanged = 0;
    const byCategory: Record<string, number> = {};
    const details: Array<{ vendor: string; from: string; to: string; count: number; total: number }> = [];

    // Groupe les changements par (vendor, from, to) pour le rapport
    const changeMap = new Map<string, { vendor: string; from: string; to: string; count: number; total: number }>();

    for (const c of charges) {
      const result = reclassifyByVendor(c.vendor, c.category);
      if (result.changed && result.category) {
        reclassified++;
        byCategory[result.category] = (byCategory[result.category] ?? 0) + 1;

        const key = `${c.vendor}|${c.category}|${result.category}`;
        const cur = changeMap.get(key) ?? { vendor: c.vendor ?? '(sans fournisseur)', from: c.category, to: result.category, count: 0, total: 0 };
        cur.count++;
        cur.total += c.amountHT;
        changeMap.set(key, cur);

        // Recalcule allocationMethod : DIRECT si enseigne ou catégorie directe
        const newAlloc = isChargeDirecte(result.category) ? 'DIRECT' : 'GLOBAL';
        if (newAlloc !== c.allocationMethod) {
          allocationChanged++;
        }

        if (!dryRun) {
          await db.charge.update({
            where: { id: c.id },
            data: {
              category: result.category,
              allocationMethod: newAlloc,
            },
          });
        }
      }
    }

    for (const v of changeMap.values()) details.push(v);
    details.sort((a, b) => b.count - a.count);

    return NextResponse.json({
      ok: true,
      scanned: charges.length,
      reclassified,
      allocationChanged,
      dryRun,
      byCategory,
      details: details.slice(0, 50),
      knownVendors: knownVendors(),
    });
  } catch (e) {
    console.error('Erreur /api/charges/reclassify:', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur serveur' },
      { status: 500 },
    );
  }
}

/**
 * GET /api/charges/reclassify — aperçu des règles de reclassification
 * (sans modifier la base). Utile pour afficher un récap avant action.
 */
export async function GET() {
  try {
    return POST(new NextRequest('https://placeholder/api/charges/reclassify', {
      method: 'POST',
      body: JSON.stringify({ dryRun: true }),
      headers: { 'content-type': 'application/json' },
    }));
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 },
    );
  }
}
