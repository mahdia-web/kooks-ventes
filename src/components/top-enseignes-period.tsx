'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatEuro } from '@/lib/dashboard-service';
import type { EnseignePeriodStat } from '@/lib/dashboard-types';

// Palette Kooks — couleurs distinctes Direct (bleu) vs Centrale (orange)
const COLORS_DIRECT = ['#3674b5', '#5a8dc8', '#1f4d80', '#7ba8d5', '#264f7a'];
const COLORS_CENTRALE = ['#f7a941', '#fbc777', '#bb7e40', '#fdd29a', '#a16622'];

interface TopEnseignesPeriodCardProps {
  enseignes: EnseignePeriodStat[];
}

function PeriodEnseigneList({ items }: { items: EnseignePeriodStat[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        Aucune enseigne dans cette catégorie sur la période.
      </p>
    );
  }
  const maxCa = items[0]?.caHT || 1;
  return (
    <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
      {items.map((e, idx) => {
        const colors = e.type === 'Direct' ? COLORS_DIRECT : COLORS_CENTRALE;
        return (
          <div key={e.enseigne} className="space-y-1">
            <div className="flex items-center justify-between text-sm gap-2">
              <span className="font-medium truncate">
                <span className="text-muted-foreground mr-1.5">{idx + 1}.</span>
                {e.enseigne}
                <span className="ml-2 text-[10px] text-muted-foreground">({e.nbBl} BL)</span>
              </span>
              <span className="shrink-0 font-mono font-semibold">
                {formatEuro(e.caHT)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 flex-1 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${(e.caHT / maxCa) * 100}%`,
                    backgroundColor: colors[idx % colors.length],
                  }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0 w-12 text-right">
                {e.share.toFixed(1)}%
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function TopEnseignesPeriodCard({ enseignes }: TopEnseignesPeriodCardProps) {
  const [filter, setFilter] = useState<'all' | 'direct' | 'centrale'>('all');

  const direct = enseignes.filter((e) => e.type === 'Direct');
  const centrale = enseignes.filter((e) => e.type === 'Centrale');

  const visible =
    filter === 'direct' ? direct : filter === 'centrale' ? centrale : enseignes;
  const top = visible.slice(0, 15);

  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="font-title">Top enseignes — Période totale</CardTitle>
            <CardDescription>
              Cumul CA HT sur toute la période • {direct.length} directes, {centrale.length} centrales
            </CardDescription>
          </div>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <TabsList className="bg-muted h-auto">
              <TabsTrigger
                value="all"
                className="data-[state=active]:bg-card data-[state=active]:text-primary text-xs h-7"
              >
                Tous ({enseignes.length})
              </TabsTrigger>
              <TabsTrigger
                value="direct"
                className="data-[state=active]:bg-card data-[state=active]:text-[#3674b5] text-xs h-7"
              >
                Direct ({direct.length})
              </TabsTrigger>
              <TabsTrigger
                value="centrale"
                className="data-[state=active]:bg-card data-[state=active]:text-primary text-xs h-7"
              >
                Centrale ({centrale.length})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent>
        <PeriodEnseigneList items={top} />
      </CardContent>
    </Card>
  );
}
