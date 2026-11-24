import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/migrations/diagnose-sachet?year=2026&month=10
 *
 * Vérifie que les lignes VolumeSale avec productLabel contenant "SAC 5 KG" ou
 * "SACHET 5 KG" sont bien détectées par la regex extractFromLabel (même logique
 * que marge-estimee) et attribuées au produit "Original - Sachet".
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get('year') ?? '2026', 10);
    const month = parseInt(searchParams.get('month') ?? '10', 10);

    const volumes = await db.volumeSale.findMany({
      where: { year, month },
      select: { parfum: true, format: true, quantity: true, unitPrice: true, productLabel: true },
    });

    const norm = (s: string | null | undefined) =>
      (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[''`]/g, '').trim();

    const extractFromLabel = (label: string): { parfum: string | null; format: string | null } => {
      const l = (label || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      let parfum: string | null = null;
      if (l.includes('PEANUT')) parfum = 'Peanut Butter';
      else if (l.includes('CRISPY') || l.includes('CRY CHOC')) parfum = 'Crispy Choco';
      else if (l.includes('CARAMEL') || l.includes('CARA')) parfum = 'Caramel Pecan';
      else if (l.includes('SPECUL') || l.includes('SPEC')) parfum = 'Speculoos';
      else if (l.includes('COCO') || l.includes('NOIX DE COCO')) parfum = 'Coco';
      else if (l.includes('ORIGINAL')) parfum = 'Original';
      let format: string | null = null;
      if (l.includes('BOX 9') || l.includes('BOX DE 9') || l.includes('BOITE 9')) format = 'Box de 9';
      else if (l.includes('PAV 8') || l.includes('PAV*8') || l.includes('PAV 8*75G')) format = 'Indiv PAV 8';
      else if (l.includes('SAC 5 KG') || l.includes('SACHET 5 KG') || l.includes('SACHET 5KG') || l.includes('SAC 5KG')) format = 'Sachet';
      else if (l.includes('X2') || l.includes('LOT 2') || l.includes('LOT DE 2') || l.includes('BQ F') || l.includes('BQ')) format = 'Lot de 2';
      else if (l.includes('FOURO')) format = 'Indiv Fouro';
      return { parfum, format };
    };

    // Lignes SAC/SACHET
    const sachetLines = volumes.filter(v => /SAC.{0,3}5.{0,2}KG|SACHET.{0,3}5/i.test(v.productLabel || ''));
    let sachetCA = 0, sachetColis = 0;
    const sachetDetails: any[] = [];
    for (const v of sachetLines) {
      let parfum = v.parfum;
      let format = v.format;
      if ((!parfum || !format) && v.productLabel) {
        const ext = extractFromLabel(v.productLabel);
        if (!parfum) parfum = ext.parfum;
        if (!format) format = ext.format;
      }
      const ca = v.quantity * (v.unitPrice ?? 0);
      sachetCA += ca;
      sachetColis += v.quantity;
      sachetDetails.push({
        productLabel: v.productLabel,
        parfumOrig: v.parfum,
        formatOrig: v.format,
        parfumFinal: parfum,
        formatFinal: format,
        key: parfum && format ? `${norm(parfum)}__${norm(format)}` : null,
        quantity: v.quantity,
        unitPrice: v.unitPrice,
        ca,
      });
    }

    // Produit catalogue Sachet
    const sachetProduct = await db.product.findFirst({
      where: { format: { name: 'Sachet' } },
      include: { parfum: true, format: true },
    });
    const sachetProductKey = sachetProduct
      ? `${norm(sachetProduct.parfum?.name)}__${norm(sachetProduct.format?.name)}`
      : null;

    return NextResponse.json({
      ok: true,
      sachetLinesCount: sachetLines.length,
      sachetCA,
      sachetColis,
      sachetProduct: sachetProduct ? {
        name: sachetProduct.name,
        parfum: sachetProduct.parfum?.name,
        format: sachetProduct.format?.name,
        key: sachetProductKey,
      } : null,
      sachetDetails: sachetDetails.slice(0, 10),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    );
  }
}
