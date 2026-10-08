import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/products/[id] → renvoie le produit + prix d'achat courant + tous les prix de vente
 * PATCH /api/products/[id] → modifie le produit
 * DELETE /api/products/[id] → supprime le produit (cascade)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const product = await db.product.findUnique({
      where: { id },
      include: {
        purchasePrices: {
          orderBy: { startDate: 'desc' },
        },
        salesPrices: {
          orderBy: { enseigne: 'asc' },
        },
      },
    });
    if (!product) {
      return NextResponse.json(
        { ok: false, error: 'Produit introuvable' },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, data: product });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, description, format, potsPerColis, potsPerFormat, unitesFormatParColis, colisParPalette, potsPerPalette, unit, isActive } = body;

    const existing = await db.product.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: 'Produit introuvable' },
        { status: 404 }
      );
    }

    // Si on change le nom, vérifier l'unicité
    if (typeof name === 'string' && name.trim() !== existing.name) {
      const conflict = await db.product.findUnique({ where: { name: name.trim() } });
      if (conflict) {
        return NextResponse.json(
          { ok: false, error: `Le produit "${name.trim()}" existe déjà` },
          { status: 400 }
        );
      }
    }

    const updates: Record<string, unknown> = {};
    if (typeof name === 'string' && name.trim()) updates.name = name.trim();
    if (typeof description === 'string') updates.description = description || null;
    if (format === 'pot' || format === 'colis') updates.format = format;
    if (typeof potsPerColis === 'number' && potsPerColis > 0) updates.potsPerColis = potsPerColis;
    if (potsPerFormat === null || (typeof potsPerFormat === 'number' && potsPerFormat > 0)) {
      updates.potsPerFormat = potsPerFormat;
    }
    if (unitesFormatParColis === null || (typeof unitesFormatParColis === 'number' && unitesFormatParColis >= 0)) {
      updates.unitesFormatParColis = unitesFormatParColis;
    }
    if (colisParPalette === null || (typeof colisParPalette === 'number' && colisParPalette > 0)) {
      updates.colisParPalette = colisParPalette;
    }
    if (potsPerPalette === null || (typeof potsPerPalette === 'number' && potsPerPalette > 0)) {
      updates.potsPerPalette = potsPerPalette;
    }
    if (unit === 'pot' || unit === 'colis') updates.unit = unit;
    if (typeof isActive === 'boolean') updates.isActive = isActive;

    const updated = await db.product.update({ where: { id }, data: updates });
    return NextResponse.json({ ok: true, data: updated });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = await db.product.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: 'Produit introuvable' },
        { status: 404 }
      );
    }
    // Cascade: supprime aussi les ProductPurchasePrice et ProductSalesPrice associés
    await db.product.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    );
  }
}
