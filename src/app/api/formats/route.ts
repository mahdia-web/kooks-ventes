import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/formats — liste tous les formats/conditionnements
 * POST /api/formats — crée un nouveau format
 */
export async function GET() {
  try {
    const formats = await db.format.findMany({
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({ ok: true, data: formats });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, potsPerColis, potsPerFormat, unitesFormatPerColis, colisPerPalette, potsPerPalette } = body;
    if (!name?.trim()) {
      return NextResponse.json({ ok: false, error: 'Nom du format requis' }, { status: 400 });
    }
    const existing = await db.format.findUnique({ where: { name: name.trim() } });
    if (existing) {
      return NextResponse.json({ ok: false, error: `Le format "${name.trim()}" existe déjà` }, { status: 400 });
    }
    const format = await db.format.create({
      data: {
        name: name.trim(),
        potsPerColis: typeof potsPerColis === 'number' && potsPerColis > 0 ? potsPerColis : 1,
        potsPerFormat: typeof potsPerFormat === 'number' && potsPerFormat > 0 ? potsPerFormat : null,
        unitesFormatPerColis: typeof unitesFormatPerColis === 'number' && unitesFormatPerColis >= 0 ? unitesFormatPerColis : null,
        colisPerPalette: typeof colisPerPalette === 'number' && colisPerPalette > 0 ? colisPerPalette : null,
        potsPerPalette: typeof potsPerPalette === 'number' && potsPerPalette > 0 ? potsPerPalette : null,
      },
    });
    return NextResponse.json({ ok: true, data: format });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    );
  }
}
