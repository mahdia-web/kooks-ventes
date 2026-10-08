import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { db } from '@/lib/db';
import { setCurrentPeriod } from '@/lib/dashboard-service';
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { data, mapping: mappingRaw, detectOnly, forceType, forceAgent, replaceDuplicates } = body;
    if (!data?.trim()) return NextResponse.json({ ok: false, error: 'Aucune donnée.' }, { status: 400 });
    const workbook = XLSX.read(data, { type: 'string', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    let headerRowIdx = 0, headers: string[] = [];
    for (let tryRow = 0; tryRow < 5; tryRow++) {
      try {
        const testRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: false, defval: null, range: tryRow });
        if (!testRows.length) continue;
        const th = Object.keys(testRows[0]).map(h => h.toLowerCase());
        if (th.some(h => h.includes('date')) && th.some(h => h.includes('enseigne') || h.includes('client') || h.includes('montant'))) { headerRowIdx = tryRow; headers = Object.keys(testRows[0]); break; }
      } catch { continue; }
    }
    if (!headers.length) { const r = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: false, defval: null }); if (!r.length) return NextResponse.json({ ok: false, error: 'Aucune donnée.' }, { status: 400 }); headers = Object.keys(r[0]); }
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: false, defval: null, range: headerRowIdx });
    const usedCols = new Set<string>();
    const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[''`]/g, '').trim();
    const findCol = (patterns: string[]): string | null => { for (const p of patterns) { const pl = normalize(p); const f = headers.find(h => { if (usedCols.has(h)) return false; const hl = normalize(h); return hl === pl || hl.includes(pl); }); if (f) { usedCols.add(f); return f; } } return null; };
    const auto = { taux: findCol(['% MARGE COMMERCIALE','MARGE COMMERCIALE','TAUX']), commission: findCol(['MONTANT COMMISSION','COMMISSION']), bl: findCol(['NUMERO BL','N° BL','NUMERO','N BL','BON DE LIVRAISON','BL','RÉFÉRENCE','REFERENCE','REF']), agent: findCol(['COMMERCIAL','AGENT','REPRESENTANT','VENDEUR']), reference: findCol(['RÉFÉRENCE','REFERENCE','REF']), type: findCol(['TYPE','CANAL','CIRCUIT']), enseigne: findCol(['ENSEIGNE','CLIENT','MAGASIN']), date: findCol(['DATE']), ht: findCol(['MONTANT HT','CA HT','MT HT','HT']), ttc: findCol(['MONTANT TTC','CA TTC','MT TTC','TTC']), mois: findCol(['MOIS']), annee: findCol(['ANN']) };
    let mapping = auto;
    if (mappingRaw) { try { const p = JSON.parse(mappingRaw); mapping = { date: p.date ?? auto.date, bl: p.bl ?? auto.bl, enseigne: p.enseigne ?? auto.enseigne, type: p.type ?? auto.type, agent: p.agent ?? auto.agent, ht: p.ht ?? auto.ht, ttc: p.ttc ?? auto.ttc, taux: p.taux ?? auto.taux, commission: p.commission ?? auto.commission, mois: p.mois ?? auto.mois, annee: p.annee ?? auto.annee, reference: p.reference ?? auto.reference }; } catch {} }
    if (!mapping.date || !mapping.enseigne || (!mapping.ht && !mapping.ttc)) return NextResponse.json({ ok: false, error: 'Colonnes manquantes', detectedColumns: headers, detectedMapping: mapping }, { status: 400 });
    const existingKeys = new Set((await db.sale.findMany({ select: { deduplicationKey: true } })).map(s => s.deduplicationKey));
    const existingEnseignes = await db.enseigne.findMany();
    const enseigneTypeMap = new Map(existingEnseignes.map(e => [e.name, e.type]));
    const activeAgents = await db.agent.findMany({ where: { isActive: true }, select: { name: true } });
    const toInsert: any[] = [];
    let skipped = 0;
    for (const row of rows) {
      const toStr = (v: unknown) => v ? String(v).trim() : '';
      const toNum = (v: unknown) => { if (typeof v === 'number') return v; if (typeof v === 'string') { const c = v.replace(/\s/g,'').replace(/€/g,'').replace(',', '.'); const n = parseFloat(c); return isNaN(n) ? 0 : n; } return 0; };
      let date: Date | null = null;
      const dr = mapping.date ? row[mapping.date] : null;
      if (dr instanceof Date) date = dr; else if (typeof dr === 'number') { const e = new Date(Date.UTC(1899,11,30)); date = new Date(e.getTime() + dr*86400000); } else if (typeof dr === 'string' && dr.trim()) { const t = dr.trim(); const m = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/); if (m) { const d=parseInt(m[1]),mo=parseInt(m[2]); let y=parseInt(m[3]); if(y<100) y+=2000; date=new Date(y,mo-1,d); } else { const p=new Date(t); if(!isNaN(p.getTime())) date=p; } }
      if (!date || isNaN(date.getTime()) || date.getFullYear() < 2020) { skipped++; continue; }
      const enseigne = toStr(mapping.enseigne ? row[mapping.enseigne] : null);
      if (!enseigne || /^(total|totaux|somme)$/i.test(enseigne)) { skipped++; continue; }
      const ht = toNum(mapping.ht ? row[mapping.ht] : null); const ttc = toNum(mapping.ttc ? row[mapping.ttc] : null);
      const finalHT = ht || (ttc ? ttc/1.056 : 0); if (!finalHT) { skipped++; continue; }
      const ne = normalize(enseigne);
      const isCentrale = ['otera','scapest','scachap','scaouest','aldouest','centra approvi','cooperative approvisionnement','societe cooperative dapprovi'].some(p => ne.includes(p));
      let type = ''; if (forceType && forceType !== 'auto') type = forceType; else if (enseigneTypeMap.has(enseigne)) type = enseigneTypeMap.get(enseigne)!; else type = toStr(mapping.type ? row[mapping.type] : null) || (isCentrale ? 'Centrale' : 'Direct');
      let agent = (forceAgent && forceAgent.trim()) || toStr(mapping.agent ? row[mapping.agent] : null);
      if (!agent && mapping.reference) { const ref = toStr(row[mapping.reference]); const m2 = ref.match(/\b(?:via|par)\s+([A-Z][A-Z\s&]{2,30})/); if (m2) agent = m2[1].trim().split(/\s+(?:À|A|ET|DE|POUR)\s+/)[0].trim(); if (!agent) { const ru = ref.toUpperCase(); for (const a of activeAgents) { if (ru.includes(a.name.toUpperCase())) { agent = a.name; break; } } } }
      if (!agent) agent = 'Inconnu';
      const explicitRate = toNum(mapping.taux ? row[mapping.taux] : null);
      // Règle Kooks : 7% sur le CA Direct, 5% sur le CA Centrale
      const rate = explicitRate > 0 ? (explicitRate > 1 ? explicitRate/100 : explicitRate) : (type === 'Centrale' ? 0.05 : 0.07);
      const explicitCommission = toNum(mapping.commission ? row[mapping.commission] : null);
      const commission = explicitCommission > 0 ? explicitCommission : finalHT * rate;
      const blNumber = mapping.bl ? toStr(row[mapping.bl]) : null;
      const deduplicationKey = blNumber ? `${blNumber}|${agent}` : `${date.toISOString().split('T')[0]}|${enseigne}|${type}|${finalHT.toFixed(2)}|${agent}`;
      if (!replaceDuplicates && existingKeys.has(deduplicationKey)) { skipped++; continue; }
      toInsert.push({ blNumber, deduplicationKey, date, enseigne, type, agent, amountHT: finalHT, amountTTC: ttc || finalHT*1.056, rate, commission, month: date.getMonth()+1, year: date.getFullYear() });
    }
    if (detectOnly) return NextResponse.json({ ok: true, detectedColumns: headers, detectedMapping: mapping, preview: { validRows: toInsert.length, duplicates: skipped, sample: toInsert.slice(0,3).map(v => ({ date: v.date.toISOString().split('T')[0], enseigne: v.enseigne, type: v.type, agent: v.agent, amountHT: v.amountHT })) } });
    let inserted = 0, updated = 0;
    for (const v of toInsert) { try { if (replaceDuplicates && existingKeys.has(v.deduplicationKey)) { const { deduplicationKey, ...ud } = v; await db.sale.updateMany({ where: { deduplicationKey: v.deduplicationKey }, data: ud }); updated++; } else { await db.sale.create({ data: v }); inserted++; } } catch {} }
    if (inserted > 0 || updated > 0) { const nd = toInsert.reduce((m,v) => v.date > m ? v.date : m, toInsert[0].date); const dbLatest = await db.sale.findFirst({ orderBy: { date: 'desc' }, select: { date: true } }); const ol = dbLatest && dbLatest.date > nd ? dbLatest.date : nd; await setCurrentPeriod(ol.getFullYear(), ol.getMonth()+1); }
    const detail = [`${inserted} nouvelle(s)`, updated > 0 ? `${updated} MAJ` : null, (!replaceDuplicates && skipped > 0) ? `${skipped} doublon(s)` : null].filter(Boolean).join(', ');
    return NextResponse.json({ ok: true, result: { inserted, updated, skipped, total: toInsert.length }, detail, detectedColumns: headers, detectedMapping: mapping, totals: { commission: toInsert.reduce((s,v) => s+v.commission,0), caHT: toInsert.reduce((s,v) => s+v.amountHT,0) } });
  } catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 }); }
}
