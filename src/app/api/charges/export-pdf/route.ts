import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const maxDuration = 30;

/**
 * GET /api/charges/export-pdf?startDate=JJ/MM/AAAA&endDate=JJ/MM/AAAA
 *
 * Génère une page HTML imprimable (PDF via Ctrl+P / window.print) récapitulant
 * les charges de la période avec:
 *  - Synthèse: total HT/TTC, directes vs indirectes, top catégories
 *  - Tableau détaillé des charges
 *  - Analyse intelligente: suggestions d'économies sur les plus grosses charges
 *    (pas uniquement les matières premières)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const startDateStr = searchParams.get('startDate');
    const endDateStr = searchParams.get('endDate');

    if (!startDateStr || !endDateStr) {
      return NextResponse.json({ ok: false, error: 'startDate et endDate requis (JJ/MM/AAAA)' }, { status: 400 });
    }
    const m1 = startDateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const m2 = endDateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m1 || !m2) {
      return NextResponse.json({ ok: false, error: 'Format date invalide' }, { status: 400 });
    }
    const start = new Date(parseInt(m1[3]), parseInt(m1[2]) - 1, parseInt(m1[1]));
    const end = new Date(parseInt(m2[3]), parseInt(m2[2]) - 1, parseInt(m2[1]), 23, 59, 59);

    const charges = await db.charge.findMany({
      where: { date: { gte: start, lte: end } },
      select: { date: true, category: true, vendor: true, enseigne: true, amountHT: true, amountTTC: true, allocationMethod: true, subLabel: true },
      orderBy: { date: 'asc' },
    });

    const totalHT = charges.reduce((s, c) => s + c.amountHT, 0);
    const totalTTC = charges.reduce((s, c) => s + c.amountTTC, 0);
    const directTTC = charges.filter(c => c.allocationMethod === 'DIRECT').reduce((s, c) => s + c.amountTTC, 0);
    const indirectTTC = totalTTC - directTTC;

    // Top catégories
    const byCat = new Map<string, { ht: number; ttc: number; count: number }>();
    for (const c of charges) {
      const cur = byCat.get(c.category) ?? { ht: 0, ttc: 0, count: 0 };
      cur.ht += c.amountHT; cur.ttc += c.amountTTC; cur.count++;
      byCat.set(c.category, cur);
    }
    const topCats = Array.from(byCat.entries())
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.ttc - a.ttc);

    // Top fournisseurs
    const byVendor = new Map<string, { ht: number; ttc: number; count: number }>();
    for (const c of charges) {
      const v = c.vendor || '(sans fournisseur)';
      const cur = byVendor.get(v) ?? { ht: 0, ttc: 0, count: 0 };
      cur.ht += c.amountHT; cur.ttc += c.amountTTC; cur.count++;
      byVendor.set(v, cur);
    }
    const topVendors = Array.from(byVendor.entries())
      .map(([vendor, v]) => ({ vendor, ...v }))
      .sort((a, b) => b.ttc - a.ttc)
      .slice(0, 10);

    // === Analyse intelligente: suggestions d'économies ===
    const suggestions: Array<{ category: string; amount: number; pct: number; advice: string; priority: 'high' | 'medium' | 'low' }> = [];
    const sumForPct = totalTTC > 0 ? totalTTC : 1;

    for (const cat of topCats) {
      const pct = (cat.ttc / sumForPct) * 100;
      const l = cat.category.toLowerCase();
      let advice = '';
      let priority: 'high' | 'medium' | 'low' = 'low';

      if (pct < 3) continue; // on n'analyse que les charges significatives (>3%)

      if (l.includes('transport') || l.includes('logistique')) {
        advice = `Transport = ${pct.toFixed(1)}% des charges. Renégocier les tarifs transporteurs (-3 à -5%), regrouper les livraisons pour réduire le nb de BL, et privilégier les livraison groupées par enseigne pourrait économiser ~${(cat.ttc * 0.04).toFixed(0)}€/période.`;
        priority = 'high';
      } else if (l.includes('salaire') || l.includes('rémunération') || l.includes('paie')) {
        advice = `Salaires = ${pct.toFixed(1)}% des charges. Vérifier l'éligibilité aux aides (réduction Fillon, exonération apprentissage), optimiser les heures sup (majoration 25% défiscalisée jusqu'à 5000€/an/salarié). Optimisation RH possible ~${(cat.ttc * 0.02).toFixed(0)}€/an.`;
        priority = 'medium';
      } else if (l.includes('marketing') || l.includes('publicit') || l.includes('annonce')) {
        advice = `Marketing = ${pct.toFixed(1)}% des charges. Mesurer le ROI par canal (catalogues vs digital), réallouer vers les canaux les plus performants. Économie potentielle ~${(cat.ttc * 0.10).toFixed(0)}€/période.`;
        priority = 'medium';
      } else if (l.includes('loyer') || l.includes('immobil') || l.includes('location')) {
        advice = `Loyer = ${pct.toFixed(1)}% des charges. Renégocier le bail tous les 3 ans, vérifier les charges récupérables, envisager la sous-location d'espaces inutilisés.`;
        priority = 'low';
      } else if (l.includes('énergie') || l.includes('électricité') || l.includes('gaz')) {
        advice = `Énergie = ${pct.toFixed(1)}% des charges. Comparer les offres de fournisseurs, optimiser les contrats (tarif réglementé vs marché), installer des minuteurs/LED. Économie ~${(cat.ttc * 0.08).toFixed(0)}€/an.`;
        priority = 'medium';
      } else if (l.includes('achat') && l.includes('matière')) {
        advice = `Achats matières premières = ${pct.toFixed(1)}% des charges. Négocier les volumes avec les fournisseurs (remises sur quantité), comparer 3 devis par an, sécuriser les prix sur 6 mois.`;
        priority = 'high';
      } else if (l.includes('emballage')) {
        advice = `Emballages = ${pct.toFixed(1)}% des charges. Acheter en gros, standardiser les formats, négocier avec 2-3 fournisseurs. Économie ~${(cat.ttc * 0.05).toFixed(0)}€/an.`;
        priority = 'medium';
      } else if (l.includes('honoraire') || l.includes('comptable') || l.includes('juridique')) {
        advice = `Honoraires = ${pct.toFixed(1)}% des charges. Mettre en concurrence annuelle, forfaitiser les missions récurrentes, internaliser les tâches simples.`;
        priority = 'low';
      } else if (l.includes('assurance')) {
        advice = `Assurances = ${pct.toFixed(1)}% des charges. Comparer les devis chaque année, augmenter la franchise si le sinistre est faible, regrouper les contrats.`;
        priority = 'low';
      } else if (l.includes('abonnement') || l.includes('logiciel')) {
        advice = `Abonnements/logiciels = ${pct.toFixed(1)}% des charges. Auditer les abonnements inutilisés, négocier les licences annuelles (vs mensuelles), regrouper les outils.`;
        priority = 'medium';
      } else if (pct >= 5) {
        advice = `${cat.category} = ${pct.toFixed(1)}% des charges. Catégorie importante à analyser: comparer les fournisseurs, négocier les tarifs, vérifier le caractère indispensable de chaque ligne.`;
        priority = 'medium';
      } else {
        continue;
      }

      suggestions.push({ category: cat.category, amount: cat.ttc, pct, advice, priority });
    }

    const fmt = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
    const fmtDate = (d: Date) => d.toLocaleDateString('fr-FR');
    const esc = (s: string) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Récapitulatif charges ${esc(startDateStr)} → ${esc(endDateStr)}</title>
<style>
  body { font-family: 'Helvetica Neue', Arial, sans-serif; margin: 24px; color: #1a1a1a; font-size: 12px; }
  h1 { font-size: 22px; color: #b8860b; border-bottom: 2px solid #b8860b; padding-bottom: 8px; margin-bottom: 4px; }
  .periode { color: #666; font-size: 12px; margin-bottom: 24px; }
  h2 { font-size: 16px; color: #1a1a1a; border-left: 3px solid #b8860b; padding-left: 8px; margin-top: 28px; margin-bottom: 12px; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
  .kpi { background: #fffaf0; border: 1px solid #e8d6a4; border-radius: 8px; padding: 12px; }
  .kpi-label { font-size: 10px; color: #888; text-transform: uppercase; }
  .kpi-value { font-size: 18px; font-weight: 700; color: #b8860b; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th { background: #b8860b; color: white; padding: 8px; text-align: left; font-size: 11px; }
  td { padding: 6px 8px; border-bottom: 1px solid #eee; font-size: 11px; }
  tr:nth-child(even) td { background: #faf6ec; }
  .suggest { background: #fef9e7; border: 1px solid #f0c040; border-radius: 8px; padding: 12px; margin-bottom: 10px; }
  .suggest.high { border-left: 4px solid #c0392b; }
  .suggest.medium { border-left: 4px solid #e67e22; }
  .suggest.low { border-left: 4px solid #27ae60; }
  .suggest-title { font-weight: 700; font-size: 12px; margin-bottom: 4px; }
  .suggest-pct { color: #888; font-size: 11px; }
  .suggest-advice { font-size: 11px; line-height: 1.5; }
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #eee; font-size: 10px; color: #888; text-align: center; }
  @media print { body { margin: 0; } .noprint { display: none; } }
</style>
</head>
<body>
  <h1>KOOK'S — Récapitulatif des charges</h1>
  <div class="periode">Période : ${esc(startDateStr)} → ${esc(endDateStr)} • ${charges.length} lignes • Édité le ${fmtDate(new Date())}</div>

  <div class="kpis">
    <div class="kpi"><div class="kpi-label">Total HT</div><div class="kpi-value">${fmt(totalHT)}</div></div>
    <div class="kpi"><div class="kpi-label">Total TTC</div><div class="kpi-value">${fmt(totalTTC)}</div></div>
    <div class="kpi"><div class="kpi-label">Charges directes</div><div class="kpi-value">${fmt(directTTC)}</div></div>
    <div class="kpi"><div class="kpi-label">Charges indirectes</div><div class="kpi-value">${fmt(indirectTTC)}</div></div>
  </div>

  <h2>Top catégories de charges</h2>
  <table>
    <thead><tr><th>Catégorie</th><th style="text-align:right">Montant HT</th><th style="text-align:right">Montant TTC</th><th style="text-align:right">% du total</th><th style="text-align:right">Nb lignes</th><th>Allocation dominante</th></tr></thead>
    <tbody>
      ${topCats.slice(0, 15).map(c => {
        const pct = (c.ttc / sumForPct) * 100;
        const directCount = charges.filter(ch => ch.category === c.category && ch.allocationMethod === 'DIRECT').length;
        const indirectCount = c.count - directCount;
        const dom = directCount > indirectCount ? 'Directe' : (indirectCount > 0 ? 'Indirecte' : '-');
        return `<tr><td>${esc(c.category)}</td><td style="text-align:right">${fmt(c.ht)}</td><td style="text-align:right">${fmt(c.ttc)}</td><td style="text-align:right">${pct.toFixed(1)}%</td><td style="text-align:right">${c.count}</td><td>${dom}</td></tr>`;
      }).join('')}
    </tbody>
  </table>

  <h2>Top fournisseurs</h2>
  <table>
    <thead><tr><th>Fournisseur</th><th style="text-align:right">Montant HT</th><th style="text-align:right">Montant TTC</th><th style="text-align:right">Nb factures</th></tr></thead>
    <tbody>
      ${topVendors.map(v => `<tr><td>${esc(v.vendor)}</td><td style="text-align:right">${fmt(v.ht)}</td><td style="text-align:right">${fmt(v.ttc)}</td><td style="text-align:right">${v.count}</td></tr>`).join('')}
    </tbody>
  </table>

  <h2>Analyse intelligente — leviers d'économies</h2>
  ${suggestions.length === 0 ? '<p style="color:#888;font-size:11px">Aucune suggestion significative pour cette période.</p>' : ''}
  ${suggestions.map(s => `
    <div class="suggest ${s.priority}">
      <div class="suggest-title">${esc(s.category)} <span class="suggest-pct">— ${fmt(s.amount)} TTC (${s.pct.toFixed(1)}% des charges)</span></div>
      <div class="suggest-advice">${esc(s.advice)}</div>
    </div>
  `).join('')}

  <h2>Détail des charges (${charges.length} lignes)</h2>
  <table>
    <thead><tr><th>Date</th><th>Catégorie</th><th>Fournisseur</th><th>Client</th><th>Libellé</th><th style="text-align:right">HT</th><th style="text-align:right">TTC</th><th>Allocation</th></tr></thead>
    <tbody>
      ${charges.slice(0, 200).map(c => `<tr><td>${fmtDate(c.date)}</td><td>${esc(c.category)}</td><td>${esc(c.vendor || '')}</td><td>${esc(c.enseigne || '')}</td><td>${esc(c.subLabel || '')}</td><td style="text-align:right">${fmt(c.amountHT)}</td><td style="text-align:right">${fmt(c.amountTTC)}</td><td>${c.allocationMethod === 'DIRECT' ? 'Directe' : 'Indirecte'}</td></tr>`).join('')}
    </tbody>
  </table>
  ${charges.length > 200 ? `<p style="font-size:10px;color:#888">${charges.length - 200} lignes supplémentaires non affichées (export CSV pour la liste complète).</p>` : ''}

  <div class="noprint" style="margin: 24px 0; text-align:center;">
    <button onclick="window.print()" style="background:#b8860b;color:white;border:none;padding:10px 24px;border-radius:8px;font-size:14px;cursor:pointer;">📄 Imprimer / Enregistrer en PDF</button>
  </div>

  <div class="footer">KOOK'S — Document généré automatiquement • ${new Date().toLocaleString('fr-FR')}</div>
  <script>window.onload = () => { /* laisse l'utilisateur cliquer */ };</script>
</body>
</html>`;

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    );
  }
}
