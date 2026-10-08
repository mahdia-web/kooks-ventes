'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatEuro } from '@/lib/dashboard-service';
import type { EnseigneStat } from '@/lib/dashboard-types';

const COLORS = [
  '#3674b5', '#f7a941', '#bb7e40', '#a6d6c9',
  '#ca8a04', '#dc2626', '#db2777', '#7c3aed',
];

interface TopEnseignesCardProps {
  enseignes: EnseigneStat[];
}

function EnseigneList({ items }: { items: EnseigneStat[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">
        Aucune enseigne dans cette catégorie pour ce mois.
      </p>
    );
  }
  const maxCa = items[0]?.caHT || 1;
  return (
    <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
      {items.map((e, idx) => (
        <div key={e.enseigne} className="space-y-1">
          <div className="flex items-center justify-between text-sm gap-2">
            <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
              <span className="text-slate-400 mr-1.5">{idx + 1}.</span>
              {e.enseigne}
            </span>
            <span className="text-slate-700 dark:text-slate-300 shrink-0 font-mono">
              {formatEuro(e.caHT)}
            </span>
          </div>
          <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${(e.caHT / maxCa) * 100}%`,
                backgroundColor: COLORS[idx % COLORS.length],
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TopEnseignesCard({ enseignes }: TopEnseignesCardProps) {
  const [filter, setFilter] = useState<'all' | 'direct' | 'centrale'>('all');

  const direct = enseignes.filter((e) => e.type === 'Direct');
  const centrale = enseignes.filter((e) => e.type === 'Centrale');

  const visible =
    filter === 'direct' ? direct : filter === 'centrale' ? centrale : enseignes;
  const top = visible.slice(0, 15);

  return (
    <Card className="border-slate-200 dark:border-slate-800">
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle>Top enseignes du mois</CardTitle>
            <CardDescription>
              Par chiffre d'affaires HT — {direct.length} directes, {centrale.length} centrales
            </CardDescription>
          </div>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <TabsList className="bg-slate-100 dark:bg-slate-800 h-auto">
              <TabsTrigger
                value="all"
                className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 text-xs h-7"
              >
                Tous ({enseignes.length})
              </TabsTrigger>
              <TabsTrigger
                value="direct"
                className="data-[state=active]:bg-primary/15 data-[state=active]:text-primary dark:data-[state=active]:bg-emerald-950/30 dark:data-[state=active]:text-primary text-xs h-7"
              >
                Direct ({direct.length})
              </TabsTrigger>
              <TabsTrigger
                value="centrale"
                className="data-[state=active]:bg-primary/15 data-[state=active]:text-primary dark:data-[state=active]:bg-teal-950/30 dark:data-[state=active]:text-primary text-xs h-7"
              >
                Centrale ({centrale.length})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent>
        <EnseigneList items={top} />
      </CardContent>
    </Card>
  );
}
