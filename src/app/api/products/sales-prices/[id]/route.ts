import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * DELETE /api/products/sales-prices/[id]
 *   Supprime un prix de vente spécifique
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = await db.productSalesPrice.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: 'Prix de vente introuvable' },
        { status: 404 }
      );
    }
    await db.productSalesPrice.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    );
  }
}
