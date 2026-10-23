import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/charges/analytique?startDate=01/01/2026&endDate=31/12/2026
 *
 * Feuille analytique — compta analytique pour calculer les marges.
 *
 * Étapes:
 *  1. Récupère toutes les ventes (Sale) dans la plage
 *  2. Récupère toutes les charges (Charge) dans la plage
 *  3. Calcule les KPIs globaux: CA total, charges totales, marge brute
 *  4. Répartit les charges par catégorie (camembert)
 *  5. Pour chaque client:
 *     - CA du client
 *     - Charges DIRECTES (allocationMethod='DIRECT' avec enseigne)
 *     - Part proportionnelle des charges GLOBAL/PROPORTIONAL (au prorata du CA)
 *     - Marge nette = CA - charges directes - part proportionnelle
 *     - Marge % = marge / CA
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const startDateStr = searchParams.get('startDate');
    const endDateStr = searchParams.get('endDate');

    // Plage par défaut : année civile en cours
    let start: Date, end: Date;
    if (startDateStr && endDateStr) {
      const m1 = startDateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      const m2 = endDateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (!m1 || !m2) {
        return NextResponse.json(
          { ok: false, error: 'Format de date invalide. Utilisez JJ/MM/AAAA' },
          { status: 400 }
        );
      }
      start = new Date(parseInt(m1[3]), parseInt(m1[2]) - 1, parseInt(m1[1]));
      end = new Date(parseInt(m2[3]), parseInt(m2[2]) - 1, parseInt(m2[1]));
    } else {
      const now = new Date();
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear(), 11, 31);
    }
    end.setHours(23, 59, 59);

    // 1. Ventes dans la plage
    const sales = await db.sale.findMany({
      where: { date: { gte: start, lte: end } },
      select: { enseigne: true, amountHT: true, agent: true, type: true, commission: true },
    });

    // CA par client + CA total
    const caByEnseigne = new Map<string, number>();
    let totalCA = 0;
    for (const s of sales) {
      caByEnseigne.set(s.enseigne, (caByEnseigne.get(s.enseigne) ?? 0) + s.amountHT);
      totalCA += s.amountHT;
    }

    // 2. Charges dans la plage
    const charges = await db.charge.findMany({
      where: { date: { gte: start, lte: end } },
      select: { enseigne: true, amountHT: true, category: true, allocationMethod: true, subLabel: true, vendor: true, date: true },
    });

    // Charges directes par client + totaux globaux
    const directChargesByEnseigne = new Map<string, number>();
    let totalDirect = 0;
    let totalShared = 0; // somme des charges GLOBAL + PROPORTIONAL
    const chargesByCategory = new Map<string, number>();
    let totalCharges = 0;

    for (const c of charges) {
      totalCharges += c.amountHT;
      chargesByCategory.set(c.category, (chargesByCategory.get(c.category) ?? 0) + c.amountHT);
      if (c.allocationMethod === 'DIRECT' && c.enseigne) {
        directChargesByEnseigne.set(c.enseigne, (directChargesByEnseigne.get(c.enseigne) ?? 0) + c.amountHT);
        totalDirect += c.amountHT;
      } else {
        totalShared += c.amountHT;
      }
    }

    // 3. KPIs globaux
    const globalKpis = {
      totalCA,
      totalCharges,
      totalDirect,
      totalShared,
      margeBrute: totalCA - totalCharges,
      margeBrutePct: totalCA > 0 ? ((totalCA - totalCharges) / totalCA) * 100 : 0,
      nbVentes: sales.length,
      nbClients: caByEnseigne.size,
      nbCharges: charges.length,
    };

    // 4. Répartition des charges par catégorie (top 10)
    const categoryBreakdown = Array.from(chargesByCategory.entries())
      .map(([category, amount]) => ({ category, amount, pct: totalCharges > 0 ? (amount / totalCharges) * 100 : 0 }))
      .sort((a, b) => b.amount - a.amount);

    // 5. Détail par client
    // Pour chaque client: CA - directes - part proportionnelle (shared × CA/totalCA)
    const clients = Array.from(caByEnseigne.entries()).map(([enseigne, ca]) => {
      const direct = directChargesByEnseigne.get(enseigne) ?? 0;
      const proportionalShare = totalCA > 0 ? (ca / totalCA) * totalShared : 0;
      const totalCharge = direct + proportionalShare;
      const marge = ca - totalCharge;
      const margePct = ca > 0 ? (marge / ca) * 100 : 0;
      return {
        enseigne,
        ca,
        directCharges: direct,
        proportionalCharges: proportionalShare,
        totalCharges: totalCharge,
        marge,
        margePct,
      };
    }).sort((a, b) => b.marge - a.marge);

    // Top 5 charges les plus coûteuses
    const topCharges = charges
      .slice()
      .sort((a, b) => b.amountHT - a.amountHT)
      .slice(0, 20)
      .map((c) => ({
        date: c.date.toISOString().split('T')[0],
        category: c.category,
        subLabel: c.subLabel,
        vendor: c.vendor,
        amountHT: c.amountHT,
        enseigne: c.enseigne,
      }));

    // Top 15 fournisseurs (par total HT) — sur la période filtrée
    const vendorMap = new Map<string, { totalHT: number; count: number; category: string }>();
    for (const c of charges) {
      const name = c.vendor?.trim() || '(sans fournisseur)';
      const cur = vendorMap.get(name) ?? { totalHT: 0, count: 0, category: c.category };
      cur.totalHT += c.amountHT;
      cur.count += 1;
      // Garde la catégorie de la 1ère occurrence trouvée
      vendorMap.set(name, cur);
    }
    const topVendors = Array.from(vendorMap.entries())
      .map(([vendor, d]) => ({ vendor, totalHT: d.totalHT, count: d.count, category: d.category, pct: totalCharges > 0 ? (d.totalHT / totalCharges) * 100 : 0 }))
      .sort((a, b) => b.totalHT - a.totalHT)
      .slice(0, 15);

    // Série mensuelle (CA + charges par mois)
    const monthlyMap = new Map<string, { year: number; month: number; ca: number; charges: number }>();
    for (const s of sales) {
      const d = new Date(s.amountHT ? 0 : 0); // dummy, juste pour la signature — on a pas la date ici
      // On n'a pas la date dans le select — on skip cette partie
    }
    // Rechargeons avec la date pour la série mensuelle
    const salesWithDate = await db.sale.findMany({
      where: { date: { gte: start, lte: end } },
      select: { date: true, amountHT: true },
    });
    for (const s of salesWithDate) {
      const d = s.date;
      const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
      const m = monthlyMap.get(key) ?? { year: d.getFullYear(), month: d.getMonth() + 1, ca: 0, charges: 0 };
      m.ca += s.amountHT;
      monthlyMap.set(key, m);
    }
    for (const c of charges) {
      const d = c.date;
      const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
      const m = monthlyMap.get(key) ?? { year: d.getFullYear(), month: d.getMonth() + 1, ca: 0, charges: 0 };
      m.charges += c.amountHT;
      monthlyMap.set(key, m);
    }
    const monthlySeries = Array.from(monthlyMap.values())
      .sort((a, b) => (a.year - b.year) || (a.month - b.month))
      .map((m) => ({
        ...m,
        label: `${String(m.month).padStart(2, '0')}/${m.year}`,
        marge: m.ca - m.charges,
      }));

    return NextResponse.json({
      ok: true,
      data: {
        period: {
          start: start.toISOString().split('T')[0],
          end: end.toISOString().split('T')[0],
        },
        globalKpis,
        categoryBreakdown,
        clients,
        topCharges,
        topVendors,
        monthlySeries,
      },
    });
  } catch (e) {
    console.error('Erreur /api/charges/analytique:', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    );
  }
}
