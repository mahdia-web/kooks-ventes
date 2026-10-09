import { NextRequest, NextResponse } from 'next/server';
import { getCurrentPeriod, getDashboardData, getDashboardDataForDateRange } from '@/lib/dashboard-service';

// GET /api/dashboard?year=2026&month=8&agent=CAP%20FRAIS
// GET /api/dashboard?startDate=01/10/2025&endDate=30/09/2026&agent=CAP%20FRAIS
// Si pas de params, utilise la période courante stockée en base.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const yearParam = searchParams.get('year');
    const monthParam = searchParams.get('month');
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const agentParam = searchParams.get('agent') ?? '';

    // Normalise le filtre agent
    const agentFilter =
      agentParam && agentParam !== 'all' && agentParam !== 'Tous les agents'
        ? agentParam
        : null;

    // Mode date range (startDate/endDate en DD/MM/YYYY)
    if (startDateParam && endDateParam) {
      const data = await getDashboardDataForDateRange(startDateParam, endDateParam, agentFilter);
      return NextResponse.json({ ok: true, data });
    }

    // Mode year/month (classique)
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

    const data = await getDashboardData(year, month, agentFilter);
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    console.error('Erreur /api/dashboard:', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur serveur' },
      { status: 500 }
    );
  }
}
