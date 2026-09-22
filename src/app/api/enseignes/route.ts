import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/enseignes → liste des enseignes de référence
export async function GET() {
  const enseignes = await db.enseigne.findMany({
    orderBy: [{ agent: 'asc' }, { type: 'asc' }, { name: 'asc' }],
  });
  return NextResponse.json({ ok: true, data: enseignes });
}
