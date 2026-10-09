'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DateRangeFilterProps {
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
  onReset: () => void;
}

const PRESETS = [
  { label: 'Mois en cours', getRange: () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start: formatDate(start), end: formatDate(end) };
  }},
  { label: 'Mois dernier', getRange: () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { start: formatDate(start), end: formatDate(end) };
  }},
  { label: '6 derniers mois', getRange: () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start: formatDate(start), end: formatDate(end) };
  }},
  { label: 'Exercice en cours', getRange: () => {
    const now = new Date();
    // Exercise starts Oct 1st
    const exerciseYear = now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
    const start = new Date(exerciseYear, 9, 1); // Oct 1
    const end = new Date(exerciseYear + 1, 8, 30); // Sep 30
    return { start: formatDate(start), end: formatDate(end) };
  }},
];

function formatDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function parseDate(s: string): Date | null {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
}

export function DateRangeFilter({ startDate, endDate, onChange, onReset }: DateRangeFilterProps) {
  const [open, setOpen] = useState(false);
  const [tempStart, setTempStart] = useState(startDate);
  const [tempEnd, setTempEnd] = useState(endDate);

  useEffect(() => {
    setTempStart(startDate);
    setTempEnd(endDate);
  }, [startDate, endDate]);

  const handlePreset = (preset: typeof PRESETS[0]) => {
    const { start, end } = preset.getRange();
    setTempStart(start);
    setTempEnd(end);
  };

  const handleValidate = () => {
    onChange(tempStart, tempEnd);
    setOpen(false);
  };

  const handleReset = () => {
    onReset();
    setOpen(false);
  };

  const displayRange = startDate && endDate ? `${startDate} - ${endDate}` : 'Sélectionner une période';

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted hover:bg-muted/70 transition-colors text-sm"
      >
        <Calendar className="h-4 w-4 text-primary" />
        <span className="font-medium">{displayRange}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {/* Reset link */}
      <button
        onClick={handleReset}
        className="ml-2 text-xs text-primary hover:underline"
      >
        Réinitialiser
      </button>

      {/* Dropdown */}
      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* Panel */}
          <div className="absolute top-full left-0 mt-2 z-50 w-96 bg-card border border-border rounded-lg shadow-xl p-4 space-y-4">
            {/* Predefined periods */}
            <div>
              <Label className="text-xs font-semibold uppercase text-muted-foreground mb-2 block">
                Périodes prédéfinies
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => handlePreset(preset)}
                    className="px-3 py-2 text-xs rounded-md border border-border hover:border-primary hover:bg-primary/5 transition-colors text-center"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom date range */}
            <div>
              <Label className="text-xs font-semibold uppercase text-muted-foreground mb-2 block">
                Période
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Début <span className="text-destructive">*</span></Label>
                  <Input
                    type="text"
                    value={tempStart}
                    onChange={(e) => setTempStart(e.target.value)}
                    placeholder="JJ/MM/AAAA"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Fin <span className="text-destructive">*</span></Label>
                  <Input
                    type="text"
                    value={tempEnd}
                    onChange={(e) => setTempEnd(e.target.value)}
                    placeholder="JJ/MM/AAAA"
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Annuler</Button>
              <Button size="sm" onClick={handleValidate} className="bg-primary text-primary-foreground hover:bg-primary/90">
                Valider
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
