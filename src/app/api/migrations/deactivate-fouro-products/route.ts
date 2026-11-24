import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * POST /api/migrations/deactivate-fouro-products
 *
 * Désactive (isActive=false) tous les produits dont le format est "Indiv Fouro"
 * car ces produits ne sont plus vendus actuellement. Les produits désactivés
 * n'apparaissent plus dans la grille tarifaire ni dans les analyses, mais
 * restent en base pour historique.
 *
 * Idempotent.
 */
export async function POST() {
  // Trouve le format "Indiv Fouro"
  const fouroFormat = await db.format.findUnique({ where: { name: 'Indiv Fouro' } });
  if (!fouroFormat) {
    return NextResponse.json({ ok: false, error: 'Format "Indiv Fouro" introuvable' }, { status: 400 });
  }

  // Liste les produits Indiv Fouro
  const products = await db.product.findMany({
    where: { formatId: fouroFormat.id },
    include: { parfum: true, format: true },
  });

  // Désactive ceux encore actifs
  let deactivated = 0;
  const details: any[] = [];
  for (const p of products) {
    if (p.isActive) {
      await db.product.update({ where: { id: p.id }, data: { isActive: false } });
      deactivated++;
      details.push({ id: p.id, name: p.name, wasActive: true });
    } else {
      details.push({ id: p.id, name: p.name, wasActive: false });
    }
  }

  return NextResponse.json({
    ok: true,
    totalFouroProducts: products.length,
    deactivated,
    details,
  });
}
