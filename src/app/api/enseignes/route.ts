import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
export async function GET() {
  try {
    const enseignes = await db.enseigne.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });
    return NextResponse.json({ ok: true, data: enseignes });
  } catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 }); }
}
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, type, agent, commissionRate, isActive } = body;
    if (!name?.trim()) return NextResponse.json({ ok: false, error: 'Nom requis' }, { status: 400 });
    const existing = await db.enseigne.findUnique({ where: { name: name.trim() } });
    if (existing) return NextResponse.json({ ok: false, error: `Le client "${name.trim()}" existe déjà` }, { status: 400 });
    // Si pas d'agent spécifié, on tente de trouver KOOK'S comme fallback
    let finalAgent = agent?.trim() || '';
    if (!finalAgent) {
      const kooks = await db.agent.findFirst({ where: { name: { contains: 'KOOK' } } });
      finalAgent = kooks?.name ?? "KOOK'S";
    }
    const enseigne = await db.enseigne.create({ data: { name: name.trim(), type: type === 'Centrale' ? 'Centrale' : 'Direct', agent: finalAgent, commissionRate: typeof commissionRate === 'number' ? commissionRate : null, isActive: typeof isActive === 'boolean' ? isActive : true } });
    return NextResponse.json({ ok: true, data: enseigne });
  } catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 }); }
}
