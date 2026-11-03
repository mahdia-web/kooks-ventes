import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/clients/export?agent=BROCARD&status=all|relance|inactif
 *
 * Exporte la liste des clients (à relancer / inactifs / tous) en CSV.
 * Filtre par agent si spécifié.
 *
 * Le CSV contient :
 *   Enseigne, Type, Agent, BL Total, CA Total, Dernière commande,
 *   Mois écoulés, Jours écoulés, Statut, Récurrence
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const agentParam = url.searchParams.get('agent') ?? '';
    const statusParam = url.searchParams.get('status') ?? 'all';

    const agentFilter = agentParam && agentParam !== 'all' ? agentParam : null;

    // Récupère toutes les ventes (groupées par enseigne)
    const where = agentFilter ? { agent: agentFilter } : {};
    const sales = await db.sale.findMany({
      where,
      select: { enseigne: true, type: true, agent: true, amountHT: true, date: true },
      orderBy: { date: 'asc' },
    });

    // Récupère les enseignes inactives
    const inactiveEnseignes = await db.enseigne.findMany({
      where: { isActive: false },
      select: { name: true },
    });
    const inactiveNames = new Set(inactiveEnseignes.map((e) => e.name));

    // Groupe par enseigne
    const byEnseigne = new Map<string, {
      enseigne: string; type: string; agent: string;
      nbBlTotal: number; caTotal: number;
      lastOrder: Date | null; firstOrder: Date | null;
      dates: Set<string>;
    }>();

    for (const r of sales) {
      const s = byEnseigne.get(r.enseigne) ?? {
        enseigne: r.enseigne, type: r.type, agent: r.agent,
        nbBlTotal: 0, caTotal: 0,
        lastOrder: null as Date | null, firstOrder: null as Date | null,
        dates: new Set<string>(),
      };
      s.nbBlTotal += 1;
      s.caTotal += r.amountHT;
      const d = new Date(r.date);
      if (!s.lastOrder || d > s.lastOrder) s.lastOrder = d;
      if (!s.firstOrder || d < s.firstOrder) s.firstOrder = d;
      s.dates.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      byEnseigne.set(r.enseigne, s);
    }

    // Calcule le statut et les métriques
    const now = new Date();
    const customers = Array.from(byEnseigne.values())
      .filter((s) => !inactiveNames.has(s.enseigne))
      .map((s) => {
        const daysSinceLastOrder = s.lastOrder
          ? Math.floor((now.getTime() - s.lastOrder.getTime()) / (1000 * 60 * 60 * 24))
          : 9999;
        const monthsSinceLastOrder = Math.floor(daysSinceLastOrder / 30);
        const recurrence = s.dates.size > 0 ? s.dates.size / Math.max(1, monthsSinceLastOrder + 1) : 0;

        let status: 'OK' | 'A RELANCER' | 'INACTIF' = 'OK';
        if (monthsSinceLastOrder > 3) status = 'INACTIF';
        else if (monthsSinceLastOrder > 1) status = 'A RELANCER';

        return {
          ...s,
          lastOrder: s.lastOrder ? s.lastOrder.toISOString().split('T')[0] : '',
          daysSinceLastOrder,
          monthsSinceLastOrder,
          status,
          recurrence,
        };
      })
      .filter((c) => {
        if (statusParam === 'relance') return c.status === 'A RELANCER';
        if (statusParam === 'inactif') return c.status === 'INACTIF';
        return true;
      })
      .sort((a, b) => b.caTotal - a.caTotal);

    // Génère le CSV
    const headers = [
      'Enseigne', 'Type', 'Agent', 'BL Total', 'CA Total (€)',
      'Dernière commande', 'Mois écoulés', 'Jours écoulés', 'Statut', 'Récurrence'
    ];

    const csvLines = [headers.join(';')];
    for (const c of customers) {
      const row = [
        `"${c.enseigne.replace(/"/g, '""')}"`,
        c.type,
        c.agent,
        String(c.nbBlTotal),
        c.caTotal.toFixed(2).replace('.', ','),
        c.lastOrder,
        String(c.monthsSinceLastOrder),
        String(c.daysSinceLastOrder),
        c.status,
        (c.recurrence * 100).toFixed(1).replace('.', ',') + '%',
      ];
      csvLines.push(row.join(';'));
    }

    const csv = '\uFEFF' + csvLines.join('\n'); // BOM for Excel UTF-8

    const filename = `clients_${agentFilter ?? 'tous'}_${statusParam}_${new Date().toISOString().split('T')[0]}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    console.error('[export] Error:', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    );
  }
}
