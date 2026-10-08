import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * POST /api/products/purchase-prices
 *   Body: {
 *     productId,
 *     pricePerPot,
 *     pricePerColis?,     // auto-calculé depuis pricePerPot × potsPerColis si non fourni
 *     pricePerFormat?,    // prix au format (lot de 2 pots, boîte de 9 pots)
 *     parfum?,            // "Original" par défaut — cf catalogue Kooks (6 parfums)
 *     variant?,           // sous-variant (ex: "Fouro", "PAV 8" pour INDIV)
 *   }
 *   - Clôture l'ancien prix courant (endDate = now) pour ce (productId, parfum, variant)
 *   - Crée le nouveau prix
 *   - Permet d'historiser les changements de prix d'achat
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      productId,
      pricePerPot,
      pricePerColis,
      pricePerFormat,
      parfum = 'Original',
      variant = null,
    } = body;

    if (!productId) {
      return NextResponse.json({ ok: false, error: 'productId requis' }, { status: 400 });
    }
    if (typeof pricePerPot !== 'number' || pricePerPot < 0) {
      return NextResponse.json({ ok: false, error: 'pricePerPot doit être un nombre ≥ 0' }, { status: 400 });
    }

    // Inclut le Format lié pour récupérer les données de packaging
    const product = await db.product.findUnique({
      where: { id: productId },
      include: { format: true, parfum: true },
    });
    if (!product) {
      return NextResponse.json({ ok: false, error: 'Produit introuvable' }, { status: 404 });
    }

    // Récupère les données de packaging depuis le Format lié (ou les anciens champs du Product)
    const potsPerColis = product.format?.potsPerColis ?? product.potsPerColis ?? 1;
    const potsPerFormat = product.format?.potsPerFormat ?? product.potsPerFormat ?? null;

    // Calcule le prix au colis si non fourni
    const finalColisPrice =
      typeof pricePerColis === 'number' && pricePerColis > 0
        ? pricePerColis
        : pricePerPot * potsPerColis;

    // Calcule le prix au format si non fourni mais que le format a un potsPerFormat
    let finalFormatPrice: number | null = null;
    if (typeof pricePerFormat === 'number' && pricePerFormat > 0) {
      finalFormatPrice = pricePerFormat;
    } else if (potsPerFormat && potsPerFormat > 0) {
      finalFormatPrice = pricePerPot * potsPerFormat;
    }

    // Clôture l'ancien prix courant pour ce produit (endDate = now)
    const now = new Date();
    await db.productPurchasePrice.updateMany({
      where: { productId, endDate: null },
      data: { endDate: now },
    });

    // Crée le nouveau prix
    const newPrice = await db.productPurchasePrice.create({
      data: {
        productId,
        parfum,
        variant,
        pricePerPot,
        pricePerFormat: finalFormatPrice,
        pricePerColis: finalColisPrice,
        startDate: now,
      },
    });

    return NextResponse.json({ ok: true, data: newPrice });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    );
  }
}
