'use client';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Store, Trophy, Medal, Award } from 'lucide-react';
import { formatEuro, formatNumber } from '@/lib/dashboard-service';
const RANK = [<Trophy key="0" className="h-4 w-4 text-amber-500" />, <Medal key="1" className="h-4 w-4 text-slate-400" />, <Award key="2" className="h-4 w-4 text-orange-400" />];
export function TopOterStoresCard({ year, month }: { year: number; month: number }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { let m = true; fetch(`/api/otera?year=${year}&month=${month}`).then(r => r.json()).then(j => { if (m && j.ok) setData(j.data); }).catch(() => {}).finally(() => { if (m) setLoading(false); }); return () => { m = false; }; }, [year, month]);
  if (loading || !data || !data.locations?.length) return null;
  const all = data.locations.flatMap((l: any) => l.stores.map((s: any) => ({ ...s, location: l.location }))).sort((a: any, b: any) => b.caHT - a.caHT).slice(0, 5);
  if (!all.length) return null;
  return (<Card className="border-slate-200 dark:border-slate-800"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Store className="h-5 w-5 text-emerald-600" /> Top 5 magasins OTERA</CardTitle><CardDescription>{data.totalStores} magasin(s) • CA : {formatEuro(data.totalCaHT)} • Commission : {formatEuro(data.totalCommission)}</CardDescription></CardHeader><CardContent><div className="space-y-2">{all.map((s: any, i: number) => (<div key={s.enseigne} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-800 p-2.5"><div className="flex items-center gap-3 min-w-0 flex-1"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">{RANK[i] ?? <span className="text-xs font-bold text-slate-600">{i + 1}</span>}</div><div className="min-w-0 flex-1"><p className="font-medium text-sm truncate">{s.location}</p><p className="text-xs text-slate-500 truncate">{s.enseigne}</p></div></div><div className="flex items-center gap-2 shrink-0">{s.agents?.map((a: string) => <Badge key={a} variant="outline" className="text-[10px]">{a}</Badge>)}</div><div className="text-right shrink-0"><p className="font-semibold text-emerald-700 text-sm">{formatEuro(s.caHT)}</p><p className="text-[10px] text-slate-500">{formatNumber(s.nbBL)} BL • {formatEuro(s.aov)} AOV</p></div></div>))}</div></CardContent></Card>);
}
