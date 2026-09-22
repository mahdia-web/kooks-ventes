import { NextRequest, NextResponse } from 'next/server';
import { getCurrentPeriod, setCurrentPeriod } from '@/lib/dashboard-service';

// GET /api/period → renvoie la période courante
export async function GET() {
  const period = await getCurrentPeriod();
  return NextResponse.json({ ok: true, data: period });
}

// POST /api/period → met à jour la période courante
// Body: { "year": 2026, "month": 8 }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const year = parseInt(body.year, 10);
    const month = parseInt(body.month, 10);

    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json(
        { ok: false, error: 'year et month requis (1-12)' },
        { status: 400 }
      );
    }

    await setCurrentPeriod(year, month);
    return NextResponse.json({ ok: true, data: { year, month } });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur serveur' },
      { status: 500 }
    );
  }
}
