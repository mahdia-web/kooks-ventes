'use client';

import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { shortMonth } from '@/lib/dashboard-service';

interface PeriodSelectorProps {
  periods: { year: number; months: number[] }[];
  currentYear: number;
  currentMonth: number;
  onPeriodChange: (year: number, month: number) => void;
}

export function PeriodSelector({
  periods,
  currentYear,
  currentMonth,
  onPeriodChange,
}: PeriodSelectorProps) {
  // Trouve l'index courant dans la liste plate de tous les mois disponibles
  const flatMonths: { year: number; month: number }[] = [];
  for (const p of periods) {
    for (const m of p.months) {
      flatMonths.push({ year: p.year, month: m });
    }
  }
  const currentIdx = flatMonths.findIndex(
    (m) => m.year === currentYear && m.month === currentMonth
  );

  const goPrev = () => {
    if (currentIdx > 0) {
      const prev = flatMonths[currentIdx - 1];
      onPeriodChange(prev.year, prev.month);
    }
  };

  const goNext = () => {
    if (currentIdx < flatMonths.length - 1) {
      const next = flatMonths[currentIdx + 1];
      onPeriodChange(next.year, next.month);
    }
  };

  const canPrev = currentIdx > 0;
  const canNext = currentIdx < flatMonths.length - 1 && currentIdx !== -1;

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        onClick={goPrev}
        disabled={!canPrev}
        title="Mois précédent"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-100 dark:bg-slate-800">
        <Calendar className="h-4 w-4 text-emerald-600" />
        <Select
          value={`${currentYear}-${currentMonth}`}
          onValueChange={(v) => {
            const [y, m] = v.split('-').map(Number);
            onPeriodChange(y, m);
          }}
        >
          <SelectTrigger className="border-0 bg-transparent shadow-none p-0 h-auto focus:ring-0 font-medium">
            <SelectValue placeholder="Sélectionner période" />
          </SelectTrigger>
          <SelectContent>
            {periods.map((p) => (
              <SelectGroup key={p.year}>
                <SelectLabel className="text-xs uppercase text-slate-500">
                  {p.year}
                </SelectLabel>
                {p.months.map((m) => (
                  <SelectItem key={m} value={`${p.year}-${m}`}>
                    {shortMonth(m)} {p.year}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        variant="outline"
        size="icon"
        onClick={goNext}
        disabled={!canNext}
        title="Mois suivant"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
