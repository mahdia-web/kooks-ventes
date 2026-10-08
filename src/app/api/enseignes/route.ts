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
    const enseigne = await db.enseigne.create({ data: { name: name.trim(), type: type === 'Centrale' ? 'Centrale' : 'Direct', agent: agent?.trim() || 'Inconnu', commissionRate: typeof commissionRate === 'number' ? commissionRate : null, isActive: typeof isActive === 'boolean' ? isActive : true } });
    return NextResponse.json({ ok: true, data: enseigne });
  } catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 }); }
}
