import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { normalizeEnseigne, similarityScore } from '@/lib/normalize-enseigne';

export const maxDuration = 60;

/**
 * POST /api/fix-all
 *
 * Correction globale de tous les problèmes identifiés :
 * 1. KOOK'S commission = 0 (c'est nous-mêmes, pas de commission)
 * 2. Supprimer les doublons (SOCARA, etc.)
 * 3. COSTCO = Direct (pas Centrale)
 * 4. Synchroniser les types entre Enseigne et Sale
 */
export async function POST() {
  const results: string[] = [];

  // === 1. KOOK'S : rate=0, commission=0 ===
  const kooksSales = await db.sale.findMany({
    where: { agent: { contains: 'KOOK', mode: 'insensitive' } },
    select: { id: true, rate: true, commission: true, amountHT: true },
  });
  const kooksWithCommission = kooksSales.filter(s => s.rate !== 0 || s.commission !== 0);
  if (kooksWithCommission.length > 0) {
    await db.sale.updateMany({
      where: { agent: { contains: 'KOOK', mode: 'insensitive' } },
      data: { rate: 0, commission: 0 },
    });
    results.push(`KOOK'S: ${kooksWithCommission.length} ventes corrigees (rate=0, commission=0)`);
  } else {
    results.push(`KOOK'S: OK (deja a 0)`);
  }

  // === 2. COSTCO = Direct (pas Centrale) ===
  const costcoEnseignes = await db.enseigne.findMany({
    where: { name: { contains: 'COSTCO', mode: 'insensitive' } },
    select: { id: true, name: true, type: true },
  });
  let costcoFixed = 0;
  for (const e of costcoEnseignes) {
    if (e.type !== 'Direct') {
      await db.enseigne.update({ where: { id: e.id }, data: { type: 'Direct' } });
      await db.sale.updateMany({ where: { enseigne: e.name }, data: { type: 'Direct' } });
      costcoFixed++;
    }
  }
  results.push(`COSTCO: ${costcoFixed} enseigne(s) corrigee(s) en Direct`);

  // === 3. Doublons : détecter et fusionner ===
  const allEnseignes = await db.enseigne.findMany({
    select: { id: true, name: true, type: true, agent: true },
    orderBy: { name: 'asc' },
  });

  // Grouper par normalisation
  const groups = new Map<string, typeof allEnseignes>();
  for (const e of allEnseignes) {
    const key = normalizeEnseigne(e.name);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }

  let mergedCount = 0;
  for (const [, items] of groups) {
    if (items.length < 2) continue;

    // Choisir le canonique : celui avec le + de ventes
    let bestIdx = 0;
    let bestCount = -1;
    for (let i = 0; i < items.length; i++) {
      const count = await db.sale.count({ where: { enseigne: items[i].name } });
      if (count > bestCount) { bestCount = count; bestIdx = i; }
    }
    const canonical = items[bestIdx];
    const duplicates = items.filter((_, i) => i !== bestIdx);

    for (const dup of duplicates) {
      // Fusionne les ventes
      await db.sale.updateMany({
        where: { enseigne: dup.name },
        data: { enseigne: canonical.name },
      });
      await db.volumeSale.updateMany({
        where: { enseigne: dup.name },
        data: { enseigne: canonical.name },
      });
      await db.charge.updateMany({
        where: { enseigne: dup.name },
        data: { enseigne: canonical.name },
      });
      // Supprime le doublon
      await db.enseigne.delete({ where: { id: dup.id } });
      mergedCount++;
      results.push(`Doublon fusionne: "${dup.name}" -> "${canonical.name}"`);
    }
  }
  if (mergedCount === 0) {
    results.push(`Doublons: aucun trouve`);
  }

  // === 4. Synchroniser types Enseigne <-> Sale ===
  // Pour chaque enseigne, si le type en base ne correspond pas au type des ventes
  const typedEnseignes = await db.enseigne.findMany({
    select: { id: true, name: true, type: true },
  });
  let syncCount = 0;
  for (const e of typedEnseignes) {
    // Compte les ventes par type
    const directCount = await db.sale.count({ where: { enseigne: e.name, type: 'Direct' } });
    const centraleCount = await db.sale.count({ where: { enseigne: e.name, type: 'Centrale' } });
    const correctType = centraleCount > directCount ? 'Centrale' : 'Direct';
    if (e.type !== correctType && (directCount > 0 || centraleCount > 0)) {
      // Met à jour l'enseigne
      await db.enseigne.update({ where: { id: e.id }, data: { type: correctType } });
      // Met à jour toutes les ventes
      await db.sale.updateMany({ where: { enseigne: e.name }, data: { type: correctType } });
      syncCount++;
    }
  }
  results.push(`Sync types: ${syncCount} enseigne(s) corrigee(s)`);

  // === 5. KOOK'S enseignes : agent = KOOK'S, rate=0 ===
  const kooksEnseignes = await db.enseigne.findMany({
    where: { agent: { contains: 'KOOK', mode: 'insensitive' } },
    select: { id: true, name: true, commissionRate: true },
  });
  let kooksEnsFixed = 0;
  for (const e of kooksEnseignes) {
    if (e.commissionRate !== 0) {
      await db.enseigne.update({ where: { id: e.id }, data: { commissionRate: 0 } });
      kooksEnsFixed++;
    }
  }
  results.push(`KOOK'S enseignes: ${kooksEnsFixed} taux corriges a 0%`);

  return NextResponse.json({
    ok: true,
    results,
    summary: results.join('\n'),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
