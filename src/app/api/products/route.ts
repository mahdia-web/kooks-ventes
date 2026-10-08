import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/products
 *   ?withPrices=true → inclut le prix d'achat courant et les prix de vente
 *   ?active=true → uniquement les produits actifs
 *
 * POST /api/products
 *   Body: { name, description?, format?, potsPerColis?, unit?, isActive? }
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const withPrices = searchParams.get('withPrices') === 'true';
    const activeOnly = searchParams.get('active') === 'true';

    const products = await db.product.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      include: withPrices
        ? {
            parfum: true,
            format: true,
            purchasePrices: {
              where: { endDate: null },
              orderBy: [{ parfum: 'asc' }, { variant: 'asc' }],
            },
            salesPrices: true,
          }
        : {
            parfum: true,
            format: true,
          },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ ok: true, data: products });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, parfumId, formatId, isActive } = body;

    // Mode 1: créer une combinaison parfum × format
    if (parfumId && formatId) {
      const parfum = await db.parfum.findUnique({ where: { id: parfumId } });
      const format = await db.format.findUnique({ where: { id: formatId } });
      if (!parfum) return NextResponse.json({ ok: false, error: 'Parfum introuvable' }, { status: 400 });
      if (!format) return NextResponse.json({ ok: false, error: 'Format introuvable' }, { status: 400 });

      const productName = name?.trim() || `${parfum.name} - ${format.name}`;

      const existing = await db.product.findUnique({ where: { name: productName } });
      if (existing) {
        return NextResponse.json({ ok: false, error: `Le produit "${productName}" existe déjà` }, { status: 400 });
      }

      const product = await db.product.create({
        data: {
          name: productName,
          parfumId,
          formatId,
          isActive: typeof isActive === 'boolean' ? isActive : true,
        },
        include: { parfum: true, format: true },
      });
      return NextResponse.json({ ok: true, data: product });
    }

    // Mode 2: compatibilité ancienne (sans parfumId/formatId) — garde les anciens champs
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { ok: false, error: 'Nom du produit ou (parfumId + formatId) requis' },
        { status: 400 }
      );
    }

    const existing = await db.product.findUnique({ where: { name: name.trim() } });
    if (existing) {
      return NextResponse.json(
        { ok: false, error: `Le produit "${name.trim()}" existe déjà` },
        { status: 400 }
      );
    }

    const product = await db.product.create({
      data: {
        name: name.trim(),
        isActive: typeof isActive === 'boolean' ? isActive : true,
      },
    });

    return NextResponse.json({ ok: true, data: product });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    );
  }
}
