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

/**
 * Sélecteur de période avec 2 dropdowns séparés (Mois + Année).
 *
 * IMPORTANT : on affiche TOUJOURS les 12 mois et une plage d'années large,
 * même si l'agent sélectionné n'a pas de données pour certains mois/années.
 * On signale juste avec "(vide)" les mois sans données pour l'agent courant.
 *
 * Cela permet à l'utilisateur de naviguer librement entre les périodes
 * sans avoir à revenir à l'accueil ou changer d'agent.
 */
export function PeriodSelector({
  periods,
  currentYear,
  currentMonth,
  onPeriodChange,
}: PeriodSelectorProps) {
  // Construit la liste plate de tous les mois avec données (pour navigation flèches)
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

  // TOUJOURS afficher 12 mois et une plage d'années 2025-2030
  // (pas filtré par agent — l'utilisateur doit pouvoir naviguer librement)
  const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const ALL_YEARS = [2025, 2026, 2027, 2028, 2029, 2030];

  // Pour afficher "(vide)" sur les mois sans données
  const dataMonthsForYear = (year: number): number[] => {
    return periods.find((p) => p.year === year)?.months ?? [];
  };

  return (
    <div className="flex items-center gap-1.5">
      <Button
        variant="outline"
        size="icon"
        onClick={goPrev}
        disabled={!canPrev}
        title="Mois précédent (avec données)"
        className="h-8 w-8"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      {/* Conteneur période avec icône calendrier */}
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted">
        <Calendar className="h-3.5 w-3.5 text-primary" />

        {/* Dropdown Mois — TOUJOURS 12 mois */}
        <Select
          value={String(currentMonth)}
          onValueChange={(v) => onPeriodChange(currentYear, parseInt(v, 10))}
        >
          <SelectTrigger className="border-0 bg-transparent shadow-none p-0 h-7 w-auto min-w-[80px] focus:ring-0 font-medium text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel className="text-xs uppercase text-muted-foreground">
                Mois
              </SelectLabel>
              {ALL_MONTHS.map((m) => {
                const hasData = dataMonthsForYear(currentYear).includes(m);
                return (
                  <SelectItem
                    key={m}
                    value={String(m)}
                    className={!hasData ? 'text-muted-foreground italic' : ''}
                  >
                    {shortMonth(m)} {!hasData && '(vide)'}
                  </SelectItem>
                );
              })}
            </SelectGroup>
          </SelectContent>
        </Select>

        {/* Dropdown Année — TOUJOURS 2025-2030 */}
        <Select
          value={String(currentYear)}
          onValueChange={(v) => onPeriodChange(parseInt(v, 10), currentMonth)}
        >
          <SelectTrigger className="border-0 bg-transparent shadow-none p-0 h-7 w-auto min-w-[60px] focus:ring-0 font-medium text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel className="text-xs uppercase text-muted-foreground">
                Année
              </SelectLabel>
              {ALL_YEARS.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <Button
        variant="outline"
        size="icon"
        onClick={goNext}
        disabled={!canNext}
        title="Mois suivant (avec données)"
        className="h-8 w-8"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
