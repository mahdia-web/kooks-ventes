import { NextRequest, NextResponse } from 'next/server';
import { getSales } from '@/lib/dashboard-service';

// GET /api/sales?year=2026&month=8&agent=CAP%20FRAIS
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get('year') ?? '0', 10);
    const month = parseInt(searchParams.get('month') ?? '0', 10);
    const agentParam = searchParams.get('agent') ?? '';

    if (!year || !month) {
      return NextResponse.json(
        { ok: false, error: 'year et month requis' },
        { status: 400 }
      );
    }

    const agentFilter =
      agentParam && agentParam !== 'all' && agentParam !== 'Tous les agents'
        ? agentParam
        : null;

    const sales = await getSales(year, month, agentFilter);
    return NextResponse.json({ ok: true, data: sales });
  } catch (e) {
    console.error('Erreur /api/sales:', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur serveur' },
      { status: 500 }
    );
  }
}
