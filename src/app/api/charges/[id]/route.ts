import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const maxDuration = 60;

/**
 * PATCH /api/charges/[id]
 *
 * Édition d'une ligne de charge individuelle.
 *
 * Body (tous les champs optionnels) :
 *   {
 *     "amountHT":  number,        // nouveau montant HT
 *     "amountTTC": number,        // nouveau montant TTC
 *     "excludedFromMargin": boolean  // toggle d'affectation à la marge
 *   }
 *
 * Si amountHT ou amountTTC est fourni, l'autre est recalculé automatiquement
 * quand le taux de TVA (vatRate) est connu (TTC = HT × (1 + vatRate), et
 * inversement), pour garder la cohérence HT/TTC.
 *
 * Réponse : { ok, data: { ...charge mise à jour } }
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { amountHT, amountTTC, excludedFromMargin } = body as {
      amountHT?: number;
      amountTTC?: number;
      excludedFromMargin?: boolean;
    };

    // Charge existante (pour récupérer le taux de TVA et garder la cohérence)
    const existing = await db.charge.findUnique({
      where: { id },
      select: { id: true, vatRate: true, amountHT: true, amountTTC: true, excludedFromMargin: true },
    });
    if (!existing) {
      return NextResponse.json({ ok: false, error: 'Charge introuvable' }, { status: 404 });
    }

    const data: {
      amountHT?: number;
      amountTTC?: number;
      excludedFromMargin?: boolean;
    } = {};

    // Toggle d'affectation à la marge
    if (typeof excludedFromMargin === 'boolean') {
      data.excludedFromMargin = excludedFromMargin;
    }

    // Édition du montant — on garde HT et TTC cohérents via le taux de TVA
    const vatRate = existing.vatRate ?? 0;
    if (typeof amountHT === 'number' && !Number.isNaN(amountHT)) {
      data.amountHT = amountHT;
      if (typeof amountTTC !== 'number') {
        // Recalcule le TTC à partir du HT si seul le HT est fourni
        data.amountTTC = amountHT * (1 + vatRate);
      }
    }
    if (typeof amountTTC === 'number' && !Number.isNaN(amountTTC)) {
      data.amountTTC = amountTTC;
      if (typeof amountHT !== 'number' && vatRate > 0) {
        // Recalcule le HT à partir du TTC si seul le TTC est fourni
        data.amountHT = amountTTC / (1 + vatRate);
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ ok: false, error: 'Aucun champ à mettre à jour' }, { status: 400 });
    }

    const updated = await db.charge.update({
      where: { id },
      data,
      select: {
        id: true,
        category: true,
        subLabel: true,
        vendor: true,
        amountHT: true,
        amountTTC: true,
        vatRate: true,
        allocationMethod: true,
        excludedFromMargin: true,
      },
    });

    return NextResponse.json({ ok: true, data: updated });
  } catch (e: any) {
    console.error('[PATCH /api/charges/[id]] Erreur:', e);
    return NextResponse.json(
      { ok: false, error: e.message || 'Erreur lors de la mise à jour' },
      { status: 500 }
    );
  }
}
