import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/parfums — liste tous les parfums
 * POST /api/parfums — crée un nouveau parfum
 */
export async function GET() {
  try {
    const parfums = await db.parfum.findMany({
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({ ok: true, data: parfums });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, description } = await req.json();
    if (!name?.trim()) {
      return NextResponse.json({ ok: false, error: 'Nom requis' }, { status: 400 });
    }
    const existing = await db.parfum.findUnique({ where: { name: name.trim() } });
    if (existing) {
      return NextResponse.json({ ok: false, error: `Le parfum "${name.trim()}" existe déjà` }, { status: 400 });
    }
    const parfum = await db.parfum.create({
      data: { name: name.trim(), description: description || null },
    });
    return NextResponse.json({ ok: true, data: parfum });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    );
  }
}
