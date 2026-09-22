import { NextRequest, NextResponse } from 'next/server';
import { getCurrentPeriod, getDashboardData } from '@/lib/dashboard-service';

// GET /api/dashboard?year=2026&month=8
// Si pas de params, utilise la période courante stockée en base
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const yearParam = searchParams.get('year');
    const monthParam = searchParams.get('month');

    let year: number;
    let month: number;
    if (yearParam && monthParam) {
      year = parseInt(yearParam, 10);
      month = parseInt(monthParam, 10);
    } else {
      const current = await getCurrentPeriod();
      year = current.year;
      month = current.month;
    }

    const data = await getDashboardData(year, month);
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    console.error('Erreur /api/dashboard:', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur serveur' },
      { status: 500 }
    );
  }
}
