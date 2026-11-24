import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * POST /api/migrations/add-sachet-format
 *
 * Ajoute le format "Sachet" (CHR — sac de 5 kg) au catalogue et crée le
 * produit "Original - Sachet" pour permettre l'affectation des ventes
 * ERP "SAC 5 KG - ORIGINAL TILIZ" / "SACHET 5 KG - Peanut butter".
 *
 * Idempotent: ne crée le format/produit que s'il n'existe pas déjà.
 */
export async function POST() {
  const results: string[] = [];

  // 1. Format "Sachet" (CHR)
  let sachet = await db.format.findUnique({ where: { name: 'Sachet' } });
  if (!sachet) {
    sachet = await db.format.create({
      data: {
        name: 'Sachet',
        potsPerColis: 1,           // 1 sac = 1 unité de vente
        potsPerFormat: null,
        unitesFormatPerColis: 1,
        colisPerPalette: null,
        potsPerPalette: null,
      },
    });
    results.push(`Format "Sachet" créé (id=${sachet.id})`);
  } else {
    results.push(`Format "Sachet" existait déjà (id=${sachet.id})`);
  }

  // 2. Parfum "Original" (devrait déjà exister)
  const original = await db.parfum.findUnique({ where: { name: 'Original' } });
  if (!original) {
    return NextResponse.json({ ok: false, error: 'Parfum "Original" introuvable' }, { status: 400 });
  }

  // 3. Produit "Original - Sachet"
  const productName = 'Original - Sachet';
  let product = await db.product.findUnique({ where: { name: productName } });
  if (!product) {
    product = await db.product.create({
      data: {
        name: productName,
        parfumId: original.id,
        formatId: sachet.id,
        isActive: true,
      },
    });
    results.push(`Produit "Original - Sachet" créé (id=${product.id})`);
  } else {
    results.push(`Produit "Original - Sachet" existait déjà (id=${product.id})`);
  }

  return NextResponse.json({ ok: true, results });
}
