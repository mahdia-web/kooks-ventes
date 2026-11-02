import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, type, commissionRate, isActive, agent } = body;
    const existing = await db.enseigne.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ ok: false, error: 'Enseigne introuvable' }, { status: 404 });

    const updates: Record<string, unknown> = { lastManualUpdate: new Date() };
    if (typeof name === 'string' && name.trim()) updates.name = name.trim();
    if (type === 'Direct' || type === 'Centrale' || type === 'CHR') updates.type = type;
    if (typeof commissionRate === 'number' || commissionRate === null) updates.commissionRate = commissionRate;
    if (typeof isActive === 'boolean') updates.isActive = isActive;
    if (typeof agent === 'string') updates.agent = agent;

    // Si on renomme, on doit propager le nouveau nom AVANT l'update de l'enseigne
    // pour pouvoir référencer l'ancien nom dans les updates de ventes.
    const newName = (typeof name === 'string' && name.trim()) ? name.trim() : null;
    const oldName = existing.name;

    // Calcule le taux effectif à appliquer aux ventes
    let effectiveRate: number | null = null;
    if (type === 'Direct' || type === 'Centrale' || type === 'CHR') {
      if (type === 'CHR') {
        effectiveRate = 0;
      } else if (typeof commissionRate === 'number') {
        effectiveRate = commissionRate;
      } else if (type === 'Centrale') {
        effectiveRate = 0.05;
      } else {
        effectiveRate = 0.07;
      }
    }

    // 1) Si renommage, on propage d'abord aux ventes
    if (newName && newName !== oldName) {
      await db.sale.updateMany({ where: { enseigne: oldName }, data: { enseigne: newName } });
      await db.volumeSale.updateMany({ where: { enseigne: oldName }, data: { enseigne: newName } });
      await db.charge.updateMany({ where: { enseigne: oldName }, data: { enseigne: newName } });
      await db.productSalesPrice.updateMany({ where: { enseigne: oldName }, data: { enseigne: newName } });
    }

    // 2) Si changement de type/agent/rate, on met à jour toutes les ventes EN UN SEUL UPDATE SQL
    //    (au lieu de fetch + loop qui est très lent pour les gros clients comme MONOPRIX)
    const saleUpdates: Record<string, unknown> = {};
    let needSalesUpdate = false;
    if (type === 'Direct' || type === 'Centrale' || type === 'CHR') {
      saleUpdates.type = type;
      saleUpdates.rate = effectiveRate;
      needSalesUpdate = true;
    }
    if (typeof agent === 'string') {
      saleUpdates.agent = agent;
      needSalesUpdate = true;
    }

    const effectiveEnseigneName = newName ?? oldName;
    if (needSalesUpdate) {
      // updateMany avec rate/type/agent — une seule requête SQL
      await db.sale.updateMany({
        where: { enseigne: effectiveEnseigneName },
        data: saleUpdates,
      });
      // Recalcul commission en SQL natif : commission = amountHT * rate
      // Prisma ne supporte pas les expressions arithmétiques dans updateMany,
      // donc on fait une requête SQL brute en une seule passe.
      // PostgreSQL: UPDATE "Sale" SET commission = "amountHT" * "rate" WHERE ...
      // Le nom de table en Prisma PostgreSQL = "Sale" (case-sensitive via Prisma),
      // les colonnes sont en camelCase comme dans le schéma.
      try {
        await db.$executeRaw`
          UPDATE "Sale"
          SET commission = "amountHT" * "rate"
          WHERE enseigne = ${effectiveEnseigneName}
        `;
      } catch (e) {
        // Fallback : recalcul en JS si le SQL échoue (rare)
        console.warn('SQL bulk update failed, fallback to per-row:', e);
        const sales = await db.sale.findMany({
          where: { enseigne: effectiveEnseigneName },
          select: { id: true, amountHT: true, rate: true },
        });
        for (const s of sales) {
          await db.sale.update({
            where: { id: s.id },
            data: { commission: s.amountHT * (s.rate ?? 0) },
          });
        }
      }
    }

    // 3) Update de l'enseigne elle-même
    const updated = await db.enseigne.update({ where: { id }, data: updates });

    return NextResponse.json({ ok: true, data: updated });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 });
  }
}

// DELETE /api/enseignes/[id] — supprime un client ET toutes ses ventes
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const existing = await db.enseigne.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ ok: false, error: 'Enseigne introuvable' }, { status: 404 });

    // Supprime d'abord toutes les ventes liées
    const deletedSales = await db.sale.deleteMany({ where: { enseigne: existing.name } });
    // Supprime aussi les volumes liés
    const deletedVolumes = await db.volumeSale.deleteMany({ where: { enseigne: existing.name } });
    // Supprime les charges directes liées
    const deletedCharges = await db.charge.deleteMany({ where: { enseigne: existing.name } });
    // Supprime les tarifs produits liés
    const deletedPrices = await db.productSalesPrice.deleteMany({ where: { enseigne: existing.name } });
    // Supprime l'enseigne
    await db.enseigne.delete({ where: { id } });

    return NextResponse.json({
      ok: true,
      deleted: {
        enseigne: existing.name,
        sales: deletedSales.count,
        volumes: deletedVolumes.count,
        charges: deletedCharges.count,
        productPrices: deletedPrices.count,
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 });
  }
}
