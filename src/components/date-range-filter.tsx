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

// Format une date en DD/MM/YYYY (format affiché)
function formatDMY(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// Format une date en YYYY-MM-DD (format attendu par <input type="date">)
function formatISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Convertit DD/MM/YYYY → YYYY-MM-DD (pour le input type=date)
function dmyToIso(s: string): string {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return '';
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// Convertit YYYY-MM-DD → DD/MM/YYYY
function isoToDmy(s: string): string {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

type Preset = {
  label: string;
  getRange: () => { start: string; end: string }; // DD/MM/YYYY
};

const PRESETS: Preset[] = [
  { label: "Mois en cours", getRange: () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start: formatDMY(start), end: formatDMY(end) };
  }},
  { label: "Mois dernier", getRange: () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { start: formatDMY(start), end: formatDMY(end) };
  }},
  { label: "Trimestre en cours", getRange: () => {
    const now = new Date();
    const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
    const start = new Date(now.getFullYear(), qStartMonth, 1);
    const end = new Date(now.getFullYear(), qStartMonth + 3, 0);
    return { start: formatDMY(start), end: formatDMY(end) };
  }},
  { label: "6 derniers mois", getRange: () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start: formatDMY(start), end: formatDMY(end) };
  }},
  { label: "Année civile en cours", getRange: () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const end = new Date(now.getFullYear(), 11, 31);
    return { start: formatDMY(start), end: formatDMY(end) };
  }},
  { label: "Exercice en cours", getRange: () => {
    // Kooks : exercice du 01/10 au 30/09
    // "Exercice en cours" = l'exercice qui s'est terminé (ou se termine) cette
    // année civile. En oct-déc, c'est l'exercice qui vient de se terminer
    // (commencé l'année précédente) car le nouvel exercice vient de démarrer et
    // n'a probablement pas de données. En jan-sep, c'est l'exercice en cours
    // (commencé l'année précédente). Formule: year-1 → year.
    // Cette logique garantit qu'on a toujours des données à afficher.
    const now = new Date();
    const exerciseStartYear = now.getFullYear() - 1;
    const start = new Date(exerciseStartYear, 9, 1); // Oct 1
    const end = new Date(exerciseStartYear + 1, 8, 30); // Sep 30
    return { start: formatDMY(start), end: formatDMY(end) };
  }},
  { label: "Exercice dernier", getRange: () => {
    // L'exercice précédent (commencé il y a 2 ans, terminé l'année dernière)
    const now = new Date();
    const exerciseStartYear = now.getFullYear() - 2;
    const start = new Date(exerciseStartYear, 9, 1); // Oct 1
    const end = new Date(exerciseStartYear + 1, 8, 30); // Sep 30
    return { start: formatDMY(start), end: formatDMY(end) };
  }},
];

export function DateRangeFilter({ startDate, endDate, onChange, onReset }: DateRangeFilterProps) {
  const [open, setOpen] = useState(false);
  // Pour les inputs <input type="date">, on utilise le format ISO YYYY-MM-DD
  const [tempStartIso, setTempStartIso] = useState(dmyToIso(startDate));
  const [tempEndIso, setTempEndIso] = useState(dmyToIso(endDate));

  useEffect(() => {
    setTempStartIso(dmyToIso(startDate));
    setTempEndIso(dmyToIso(endDate));
  }, [startDate, endDate]);

  const handlePreset = (preset: Preset) => {
    const { start, end } = preset.getRange();
    // Met à jour les inputs visuels (au cas où l'utilisateur rouvre le panneau)
    setTempStartIso(dmyToIso(start));
    setTempEndIso(dmyToIso(end));
    // AUTO-APPLIQUE le preset immédiatement (pas besoin de cliquer Valider)
    onChange(start, end);
    setOpen(false);
  };

  const handleValidate = () => {
    const startDmy = tempStartIso ? isoToDmy(tempStartIso) : '';
    const endDmy = tempEndIso ? isoToDmy(tempEndIso) : '';
    if (startDmy && endDmy) {
      onChange(startDmy, endDmy);
    }
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
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted hover:bg-muted/70 transition-colors text-sm"
      >
        <Calendar className="h-4 w-4 text-primary" />
        <span className="font-medium">{displayRange}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {/* Reset link */}
      {(startDate || endDate) && (
        <button
          type="button"
          onClick={handleReset}
          className="ml-2 text-xs text-primary hover:underline inline-flex items-center gap-1"
        >
          <X className="h-3 w-3" />
          Réinitialiser
        </button>
      )}

      {/* Dropdown */}
      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* Panel */}
          <div className="absolute top-full left-0 mt-2 z-50 w-[420px] bg-card border border-border rounded-lg shadow-xl p-4 space-y-4">
            {/* Predefined periods */}
            <div>
              <Label className="text-xs font-semibold uppercase text-muted-foreground mb-2 block">
                Périodes prédéfinies
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {PRESETS.map((preset) => {
                  // Surligne le preset actif si la plage correspond
                  const isActive = startDate === preset.getRange().start && endDate === preset.getRange().end;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => handlePreset(preset)}
                      className={cn(
                        'px-3 py-2 text-xs rounded-md border transition-colors text-center',
                        isActive
                          ? 'border-primary bg-primary/10 text-primary font-medium'
                          : 'border-border hover:border-primary hover:bg-primary/5'
                      )}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom date range — utilise input type="date" natif pour faciliter la saisie */}
            <div>
              <Label className="text-xs font-semibold uppercase text-muted-foreground mb-2 block">
                Période personnalisée
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Début</Label>
                  <Input
                    type="date"
                    value={tempStartIso}
                    onChange={(e) => setTempStartIso(e.target.value)}
                    className="h-8 text-sm"
                    lang="fr-FR"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Fin</Label>
                  <Input
                    type="date"
                    value={tempEndIso}
                    onChange={(e) => setTempEndIso(e.target.value)}
                    className="h-8 text-sm"
                    lang="fr-FR"
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
