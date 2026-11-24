import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/migrations/diagnose-ca-ecart?year=2026&month=10
 *
 * Compare le CA VolumeSale (Σ quantity × unitPrice) vs Sale (Σ amountHT)
 * pour un mois donné, et identifie l'origine de l'écart par BL/enseigne.
 *
 * Hypothèses à vérifier:
 *  1. VolumeSale total > Sale total → doublons dans VolumeSale ou BL manquants dans Sale
 *  2. VolumeSale total < Sale total → BL manquants dans VolumeSale
 *  3. Écart par enseigne → problème d'extraction sur une enseigne spécifique
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get('year') ?? '2026', 10);
    const month = parseInt(searchParams.get('month') ?? '10', 10);

    // 1. VolumeSale par enseigne (CA = quantity × unitPrice)
    const volumes = await db.volumeSale.findMany({
      where: { year, month },
      select: { enseigne: true, quantity: true, unitPrice: true, productLabel: true, factureRef: true },
    });
    const volByEnseigne = new Map<string, { ca: number; colis: number; lignes: number; factures: Set<string> }>();
    let volTotal = 0;
    const volFactureSet = new Set<string>();
    for (const v of volumes) {
      const ca = v.quantity * (v.unitPrice ?? 0);
      volTotal += ca;
      const e = v.enseigne ?? '(null)';
      const cur = volByEnseigne.get(e) ?? { ca: 0, colis: 0, lignes: 0, factures: new Set<string>() };
      cur.ca += ca; cur.colis += v.quantity; cur.lignes++;
      if (v.factureRef) { cur.factures.add(v.factureRef); volFactureSet.add(v.factureRef); }
      volByEnseigne.set(e, cur);
    }

    // 2. Sale par enseigne
    const sales = await db.sale.findMany({
      where: { year, month },
      select: { enseigne: true, amountHT: true, blNumber: true, agent: true },
    });
    const saleByEnseigne = new Map<string, { ca: number; bls: number; blSet: Set<string> }>();
    let saleTotal = 0;
    const saleBlSet = new Set<string>();
    for (const s of sales) {
      saleTotal += s.amountHT;
      const e = s.enseigne ?? '(null)';
      const cur = saleByEnseigne.get(e) ?? { ca: 0, bls: 0, blSet: new Set<string>() };
      cur.ca += s.amountHT; cur.bls++;
      if (s.blNumber) { cur.blSet.add(s.blNumber); saleBlSet.add(s.blNumber); }
      saleByEnseigne.set(e, cur);
    }

    // 3. Écart par enseigne
    const allEnseignes = new Set<string>([...volByEnseigne.keys(), ...saleByEnseigne.keys()]);
    const ecartByEnseigne: Array<{ enseigne: string; volCA: number; saleCA: number; ecart: number; volColis: number; saleBLs: number }> = [];
    for (const e of allEnseignes) {
      const v = volByEnseigne.get(e);
      const s = saleByEnseigne.get(e);
      const volCA = v?.ca ?? 0;
      const saleCA = s?.ca ?? 0;
      ecartByEnseigne.push({
        enseigne: e,
        volCA,
        saleCA,
        ecart: volCA - saleCA,
        volColis: v?.colis ?? 0,
        saleBLs: s?.bls ?? 0,
      });
    }
    ecartByEnseigne.sort((a, b) => Math.abs(b.ecart) - Math.abs(a.ecart));

    return NextResponse.json({
      ok: true,
      year, month,
      totals: {
        volumeSaleCA: volTotal,
        saleCA: saleTotal,
        ecart: volTotal - saleTotal,
        volumeSaleLines: volumes.length,
        saleLines: sales.length,
        volumeSaleFactures: volFactureSet.size,
        saleBLs: saleBlSet.size,
      },
      ecartByEnseigne: ecartByEnseigne.slice(0, 25),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    );
  }
}
