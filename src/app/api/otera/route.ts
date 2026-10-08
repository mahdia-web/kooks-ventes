import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const yearParam = searchParams.get('year');
    const monthParam = searchParams.get('month');
    const where: any = { OR: [{ enseigne: { contains: 'OTERA' } }, { enseigne: { contains: "O'TERA" } }] };
    if (yearParam && monthParam) { const year = parseInt(yearParam), month = parseInt(monthParam); where.OR = [{ AND: [{ enseigne: { contains: 'OTERA' } }, { year }, { month }] }, { AND: [{ enseigne: { contains: "O'TERA" } }, { year }, { month }] }]; }
    const sales = await db.sale.findMany({ where, select: { enseigne: true, amountHT: true, amountTTC: true, commission: true, date: true, agent: true, month: true, year: true }, orderBy: { date: 'asc' } });
    const enseignesRef = await db.enseigne.findMany({ where: { OR: [{ name: { contains: 'OTERA' } }, { name: { contains: "O'TERA" } }] } });
    const locationMap = new Map(enseignesRef.map(e => [e.name, e.oteraLocation]));
    const byStore = new Map<string, any>();
    for (const s of sales) {
      const loc = locationMap.get(s.enseigne) || 'Autre';
      const st = byStore.get(s.enseigne) || { enseigne: s.enseigne, location: loc, caHT: 0, caTTC: 0, commission: 0, nbBL: 0, firstOrder: null as any, lastOrder: null as any, agents: new Set<string>() };
      st.caHT += s.amountHT; st.caTTC += s.amountTTC; st.commission += s.commission; st.nbBL++; st.agents.add(s.agent);
      if (!st.firstOrder || s.date < st.firstOrder) st.firstOrder = s.date;
      if (!st.lastOrder || s.date > st.lastOrder) st.lastOrder = s.date;
      byStore.set(s.enseigne, st);
    }
    const byLocation = new Map<string, any>();
    for (const stat of byStore.values()) {
      const l = stat.location; const a = byLocation.get(l) || { location: l, caHT: 0, caTTC: 0, commission: 0, nbBL: 0, stores: [] };
      a.caHT += stat.caHT; a.caTTC += stat.caTTC; a.commission += stat.commission; a.nbBL += stat.nbBL;
      a.stores.push({ enseigne: stat.enseigne, caHT: stat.caHT, caTTC: stat.caTTC, commission: stat.commission, nbBL: stat.nbBL, firstOrder: stat.firstOrder?.toISOString().split('T')[0] || null, lastOrder: stat.lastOrder?.toISOString().split('T')[0] || null, agents: Array.from(stat.agents), aov: stat.nbBL > 0 ? stat.caHT / stat.nbBL : 0 });
      byLocation.set(l, a);
    }
    const result = Array.from(byLocation.values()).map(l => ({ ...l, stores: l.stores.sort((a: any, b: any) => b.caHT - a.caHT) })).sort((a, b) => b.caHT - a.caHT);
    return NextResponse.json({ ok: true, data: { period: yearParam && monthParam ? { year: parseInt(yearParam), month: parseInt(monthParam) } : null, locations: result, totalStores: byStore.size, totalCaHT: result.reduce((s, l) => s + l.caHT, 0), totalCommission: result.reduce((s, l) => s + l.commission, 0), totalNbBL: result.reduce((s, l) => s + l.nbBL, 0) } });
  } catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 }); }
}
