import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, defaultDirectRate, defaultCentraleRate, isActive, email, endedAt } = body;
    const existing = await db.agent.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ ok: false, error: 'Agent introuvable' }, { status: 404 });

    const updates: Record<string, unknown> = {};
    if (typeof name === 'string') updates.name = name.trim();
    if (typeof defaultDirectRate === 'number') updates.defaultDirectRate = defaultDirectRate;
    if (typeof defaultCentraleRate === 'number') updates.defaultCentraleRate = defaultCentraleRate;
    if (typeof email === 'string') updates.email = email || null;
    if (typeof isActive === 'boolean') {
      updates.isActive = isActive;
      updates.endedAt = isActive ? null : (endedAt ? new Date(endedAt) : new Date());
    }

    const updated = await db.agent.update({ where: { id }, data: updates });

    // Propage le changement de nom aux ventes + enseignes
    if (typeof name === 'string' && name.trim() !== existing.name) {
      await db.sale.updateMany({ where: { agent: existing.name }, data: { agent: name.trim() } });
      await db.enseigne.updateMany({ where: { agent: existing.name }, data: { agent: name.trim() } });
    }

    // === PROPAGATION DES TAUX AUX VENTES EXISTANTES ===
    // Si on a changé defaultDirectRate ou defaultCentraleRate, on recalcule les ventes
    // qui n'ont pas de taux personnalisé (commissionRate null sur l'enseigne).
    // Pour chaque vente de cet agent :
    //   - Si le type est Direct et que l'enseigne n'a pas de commissionRate personnalisé
    //     → rate = agent.defaultDirectRate
    //   - Si le type est Centrale et que l'enseigne n'a pas de commissionRate personnalisé
    //     → rate = agent.defaultCentraleRate
    //   - commission = amountHT × rate
    const finalDirectRate = typeof defaultDirectRate === 'number' ? defaultDirectRate : existing.defaultDirectRate;
    const finalCentraleRate = typeof defaultCentraleRate === 'number' ? defaultCentraleRate : existing.defaultCentraleRate;
    const finalAgentName = typeof name === 'string' && name.trim() ? name.trim() : existing.name;

    const directChanged = typeof defaultDirectRate === 'number' && Math.abs(defaultDirectRate - existing.defaultDirectRate) > 0.0001;
    const centraleChanged = typeof defaultCentraleRate === 'number' && Math.abs(defaultCentraleRate - existing.defaultCentraleRate) > 0.0001;

    if (directChanged || centraleChanged) {
      // Récupère les enseignes de cet agent pour savoir lesquelles ont un taux personnalisé
      const enseignes = await db.enseigne.findMany({
        where: { agent: finalAgentName },
        select: { name: true, commissionRate: true, type: true },
      });
      const enseigneMap = new Map(enseignes.map((e) => [e.name, e]));

      // Récupère toutes les ventes de cet agent
      const sales = await db.sale.findMany({
        where: { agent: finalAgentName },
        select: { id: true, enseigne: true, type: true, amountHT: true },
      });

      let updatedCount = 0;
      for (const sale of sales) {
        const enseigne = enseigneMap.get(sale.enseigne);
        // Si l'enseigne a un taux personnalisé, on ne touche pas (l'utilisateur a explicitement surchargé)
        if (enseigne && enseigne.commissionRate !== null && enseigne.commissionRate !== undefined) {
          continue;
        }
        // Sinon, on utilise le taux de l'agent selon le type
        const newRate = sale.type === 'Centrale' ? finalCentraleRate : finalDirectRate;
        const newCommission = sale.amountHT * newRate;
        await db.sale.update({
          where: { id: sale.id },
          data: { rate: newRate, commission: newCommission },
        });
        updatedCount++;
      }
      console.log(`Agent ${finalAgentName}: ${updatedCount} ventes recalculées avec les nouveaux taux (Direct=${(finalDirectRate * 100).toFixed(1)}%, Centrale=${(finalCentraleRate * 100).toFixed(1)}%)`);
    }

    return NextResponse.json({ ok: true, data: updated });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const existing = await db.agent.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ ok: false, error: 'Agent introuvable' }, { status: 404 });
    const salesCount = await db.sale.count({ where: { agent: existing.name } });
    if (salesCount > 0) return NextResponse.json({ ok: false, error: `${salesCount} ventes associées. Désactivez-le plutôt.` }, { status: 400 });
    await db.agent.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 });
  }
}
