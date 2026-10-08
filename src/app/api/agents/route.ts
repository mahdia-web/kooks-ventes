import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
export async function GET() {
  try {
    const agents = await db.agent.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });
    return NextResponse.json({ ok: true, data: agents });
  } catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 }); }
}
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, defaultDirectRate, defaultCentraleRate, email } = body;
    if (!name?.trim()) return NextResponse.json({ ok: false, error: 'Nom requis' }, { status: 400 });
    const existing = await db.agent.findUnique({ where: { name: name.trim() } });
    if (existing) return NextResponse.json({ ok: false, error: `L'agent "${name.trim()}" existe déjà` }, { status: 400 });
    const agent = await db.agent.create({ data: { name: name.trim(), defaultDirectRate: typeof defaultDirectRate === 'number' ? defaultDirectRate : 0.07, defaultCentraleRate: typeof defaultCentraleRate === 'number' ? defaultCentraleRate : 0.05, email: email ?? null } });
    return NextResponse.json({ ok: true, data: agent });
  } catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 }); }
}
