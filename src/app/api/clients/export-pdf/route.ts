import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const maxDuration = 30;

/**
 * GET /api/clients/export-pdf?agent=BROCARD
 *
 * Génère un PDF simple contenant la liste des clients à relancer et inactifs.
 * Filtre par agent si spécifié.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const agentParam = searchParams.get('agent') ?? '';
    const agentFilter = agentParam && agentParam !== 'all' ? agentParam : null;

    // Récupère toutes les ventes
    const where = agentFilter ? { agent: agentFilter } : {};
    const sales = await db.sale.findMany({
      where,
      select: { enseigne: true, type: true, agent: true, amountHT: true, date: true },
      orderBy: { date: 'asc' },
    });

    const inactiveEnseignes = await db.enseigne.findMany({
      where: { isActive: false },
      select: { name: true },
    });
    const inactiveNames = new Set(inactiveEnseignes.map((e) => e.name));

    const byEnseigne = new Map<string, any>();
    for (const r of sales) {
      const s = byEnseigne.get(r.enseigne) ?? {
        enseigne: r.enseigne, type: r.type, agent: r.agent,
        nbBlTotal: 0, caTotal: 0, lastOrder: null as Date | null,
      };
      s.nbBlTotal += 1;
      s.caTotal += r.amountHT;
      const d = new Date(r.date);
      if (!s.lastOrder || d > s.lastOrder) s.lastOrder = d;
      byEnseigne.set(r.enseigne, s);
    }

    const now = new Date();
    const customers = Array.from(byEnseigne.values())
      .filter((s) => !inactiveNames.has(s.enseigne))
      .map((s) => {
        const daysSince = s.lastOrder ? Math.floor((now.getTime() - s.lastOrder.getTime()) / (1000 * 60 * 60 * 24)) : 9999;
        const monthsSince = Math.floor(daysSince / 30);
        let status = 'OK';
        if (monthsSince > 3) status = 'INACTIF';
        else if (monthsSince > 1) status = 'A RELANCER';
        return { ...s, lastOrder: s.lastOrder?.toISOString().split('T')[0] ?? '', daysSince, monthsSince, status };
      })
      .filter((c) => c.status !== 'OK')
      .sort((a, b) => b.caTotal - a.caTotal);

    const toRelance = customers.filter((c) => c.status === 'A RELANCER');
    const inactifs = customers.filter((c) => c.status === 'INACTIF');

    // Generate simple HTML → return as PDF-like response
    // Since we can't use jsPDF server-side easily, we return an HTML page
    // that the user can print to PDF
    const agentLabel = agentFilter ?? 'Tous agents';
    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Clients à relancer - ${agentLabel}</title>
<style>
  body { font-family: Arial, sans-serif; margin: 20px; color: #1a1206; }
  h1 { color: #f7a941; border-bottom: 2px solid #f7a941; padding-bottom: 10px; }
  h2 { color: #ca8a04; margin-top: 30px; }
  h2.inactifs { color: #dc2626; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
  th { background: #f5e9c8; padding: 8px; text-align: left; border: 1px solid #e8d6a4; }
  td { padding: 6px 8px; border: 1px solid #e8d6a4; }
  tr:nth-child(even) { background: #fffaf0; }
  .statut-relance { color: #ca8a04; font-weight: bold; }
  .statut-inactif { color: #dc2626; font-weight: bold; }
  .summary { background: #fff5db; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
  .ok { color: #059669; font-weight: bold; font-size: 14px; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
<h1>Clients à relancer — ${agentLabel}</h1>
<div class="summary">
  <p><strong>Date :</strong> ${new Date().toLocaleDateString('fr-FR')}</p>
  <p><strong>${toRelance.length}</strong> client(s) à relancer • <strong>${inactifs.length}</strong> inactif(s) sur ${customers.length} enseigne(s) suivie(s)</p>
</div>

${toRelance.length > 0 ? `
<h2>Clients à relancer (${toRelance.length})</h2>
<table>
<thead><tr><th>Enseigne</th><th>Type</th><th>BL Total</th><th>CA Total</th><th>Dern. cmd</th><th>Mois</th><th>Statut</th></tr></thead>
<tbody>
${toRelance.map((c) => `<tr><td>${c.enseigne}</td><td>${c.type}</td><td style="text-align:right">${c.nbBlTotal}</td><td style="text-align:right">${c.caTotal.toFixed(2)} €</td><td>${c.lastOrder}</td><td style="text-align:right">${c.monthsSince}</td><td class="statut-relance">${c.status}</td></tr>`).join('')}
</tbody>
</table>
` : '<p class="ok">✓ Aucun client à relancer. Excellent travail !</p>'}

${inactifs.length > 0 ? `
<h2 class="inactifs">Clients inactifs — +3 mois sans commande (${inactifs.length})</h2>
<table>
<thead><tr><th>Enseigne</th><th>Type</th><th>BL Total</th><th>CA Total</th><th>Dern. cmd</th><th>Mois</th><th>Statut</th></tr></thead>
<tbody>
${inactifs.map((c) => `<tr><td>${c.enseigne}</td><td>${c.type}</td><td style="text-align:right">${c.nbBlTotal}</td><td style="text-align:right">${c.caTotal.toFixed(2)} €</td><td>${c.lastOrder}</td><td style="text-align:right">${c.monthsSince}</td><td class="statut-inactif">${c.status}</td></tr>`).join('')}
</tbody>
</table>
` : ''}

<script>window.print();</script>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    console.error('[export-pdf] Error:', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    );
  }
}
