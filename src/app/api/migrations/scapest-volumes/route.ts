import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { scapestVolumes } from './data';

export const maxDuration = 60;

/**
 * POST /api/migrations/scapest-volumes
 *
 * Importe les volumes (colis) SCAPEST pour octobre 2026.
 * Source: SCAPEST COLIS.xlsx fourni par l'utilisateur.
 *
 * 185 lignes, 812 colis, 9 650,11€ HT
 * 2 clients: SCAPEST CHALONS + SCAPEST TREMERY (tous deux BROCARD)
 *
 * Étapes:
 *   1. Supprime les volumes existants pour SCAPEST en octobre 2026
 *   2. Pour chaque ligne, insère un VolumeSale
 *   3. Extrait parfum et format du libellé produit
 */
export async function POST(_req: NextRequest) {
  console.log('[scapest-volumes] Starting import — 185 lines expected');

  try {
    // Charge les dates des BL depuis les ventes existantes
    const bls = Array.from(new Set(scapestVolumes.map((v) => v.ref)));
    const sales = await db.sale.findMany({
      where: { blNumber: { in: bls } },
      select: { blNumber: true, date: true, enseigne: true, agent: true },
    });
    const blDateMap = new Map<string, Date>();
    const blEnseigneMap = new Map<string, string>();
    for (const s of sales) {
      if (s.blNumber) {
        blDateMap.set(s.blNumber, s.date);
        blEnseigneMap.set(s.blNumber, s.enseigne);
      }
    }
    console.log(`[scapest-volumes] Found ${sales.length} matching sales for ${bls.length} BLs`);

    // Parse date DD/MM/YYYY
    const parseDate = (s: string): Date => {
      const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (!m) return new Date(2026, 9, 1); // default Oct 2026
      return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
    };

    // Extract parfum from product label
    const extractParfum = (label: string): string => {
      const l = label.toUpperCase();
      if (l.includes('ORIGINAL')) return 'Original';
      if (l.includes('CRY') || l.includes('CRISPY')) return 'Crispy Choco';
      if (l.includes('SPECUL')) return 'Speculoos';
      if (l.includes('CARA')) return 'Caramel';
      if (l.includes('PEANUT')) return 'Peanut Butter';
      if (l.includes('COCO')) return 'Coco';
      return '';
    };

    // Extract format from product label
    const extractFormat = (label: string, formatCol: string): string => {
      const l = label.toUpperCase();
      if (l.includes('X2') || l.includes('BQ')) return 'Lot de 2';
      if (l.includes('X1') || l.includes('PAV')) return 'Indiv PAV 8';
      if (l.includes('BOX') || l.includes('9')) return 'Box de 9';
      return formatCol || '';
    };

    const result = await db.$transaction(async (tx) => {
      // 1. Supprime les volumes SCAPEST existants pour octobre 2026
      const deleted = await tx.volumeSale.deleteMany({
        where: {
          OR: [
            { enseigne: { contains: 'PARIS-EST', mode: 'insensitive' } },
            { enseigne: { contains: 'SCAPEST', mode: 'insensitive' } },
          ],
          year: 2026, month: 10,
        },
      });
      console.log(`[scapest-volumes] Deleted ${deleted.count} existing SCAPEST volumes`);

      // 2. Prépare les volumes à insérer
      const toInsert: Array<{
        date: Date; month: number; year: number;
        enseigne: string; productLabel: string;
        parfum: string | null; format: string | null;
        quantity: number; unitPrice: number | null;
        factureRef: string | null;
      }> = [];

      for (const row of scapestVolumes) {
        const date = blDateMap.get(row.ref) ?? parseDate(row.date);
        const month = date.getMonth() + 1;
        const year = date.getFullYear();
        const enseigne = row.client;
        const parfum = extractParfum(row.produit);
        const format = extractFormat(row.produit, row.format);

        toInsert.push({
          date,
          month,
          year,
          enseigne,
          productLabel: row.produit,
          parfum: parfum || null,
          format: format || null,
          quantity: Math.round(row.nbColis),
          unitPrice: row.pu > 0 ? row.pu : null,
          factureRef: row.ref,
        });
      }

      // 3. Insère en batch
      const BATCH_SIZE = 100;
      let inserted = 0;
      for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
        const batch = toInsert.slice(i, i + BATCH_SIZE);
        try {
          const res = await tx.volumeSale.createMany({ data: batch, skipDuplicates: true });
          inserted += res.count;
        } catch (e) {
          console.error(`[scapest-volumes] Batch ${i} failed:`, e);
          for (const v of batch) {
            try { await tx.volumeSale.create({ data: v }); inserted++; } catch {}
          }
        }
      }
      console.log(`[scapest-volumes] Inserted ${inserted} volume lines`);

      // 4. Calcule les totaux
      const totalColis = toInsert.reduce((s, v) => s + v.quantity, 0);
      const totalHT = scapestVolumes.reduce((s, v) => s + v.totalHt, 0);

      return {
        deletedCount: deleted.count,
        insertedCount: inserted,
        totalColis,
        totalHT,
        uniqueBLs: bls.length,
        uniqueClients: 2,
      };
    });

    console.log('[scapest-volumes] Import successful:', result);

    return NextResponse.json({
      ok: true,
      ...result,
      message: `Volumes SCAPEST importés : ${result.insertedCount} lignes, ${result.totalColis} colis, ${result.totalHT.toFixed(2)}€ HT`,
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    console.error('[scapest-volumes] Error:', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

export async function GET() {
  const totalColis = scapestVolumes.reduce((s, r) => s + r.nbColis, 0);
  const totalHT = scapestVolumes.reduce((s, r) => s + r.totalHt, 0);
  return NextResponse.json({
    ok: true,
    message: 'Utilisez POST pour importer les volumes SCAPEST',
    linesCount: scapestVolumes.length,
    totalColis,
    totalHT,
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
