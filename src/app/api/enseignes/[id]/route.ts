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
    const updated = await db.enseigne.update({ where: { id }, data: updates });
    // Propage le nom aux ventes
    if (typeof name === 'string' && name.trim() && name.trim() !== existing.name) {
      await db.sale.updateMany({ where: { enseigne: existing.name }, data: { enseigne: name.trim() } });
    }
    // Propage le type + agent + recalcul commission aux ventes
    const saleUpdates: Record<string, unknown> = {};
    let needUpdate = false;
    if (type === 'Direct' || type === 'Centrale' || type === 'CHR') {
      saleUpdates.type = type;
      const newRate = type === 'CHR' ? 0 : ((typeof commissionRate === 'number' ? commissionRate : null) ?? (type === 'Centrale' ? 0.05 : 0.07));
      saleUpdates.rate = newRate;
      needUpdate = true;
    }
    if (typeof agent === 'string') { saleUpdates.agent = agent; needUpdate = true; }
    if (needUpdate) {
      const sales = await db.sale.findMany({ where: { enseigne: existing.name }, select: { id: true, amountHT: true } });
      for (const s of sales) {
        const newRate = saleUpdates.rate as number ?? undefined;
        await db.sale.update({ where: { id: s.id }, data: { ...(saleUpdates.type ? { type: saleUpdates.type as string } : {}), ...(saleUpdates.rate ? { rate: saleUpdates.rate as number } : {}), ...(newRate !== undefined ? { commission: s.amountHT * newRate } : {}), ...(saleUpdates.agent ? { agent: saleUpdates.agent as string } : {}) } });
      }
    }
    return NextResponse.json({ ok: true, data: updated });
  } catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 }); }
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
    // Supprime l'enseigne
    await db.enseigne.delete({ where: { id } });

    return NextResponse.json({
      ok: true,
      deleted: { enseigne: existing.name, sales: deletedSales.count, volumes: deletedVolumes.count },
    });
  } catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 }); }
}
