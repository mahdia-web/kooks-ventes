'use client';

import { useState } from 'react';
import {
  Upload,
  Loader2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Info,
  Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ImportDialogProps {
  onImported: () => void;
}

interface DetectedMapping {
  date: string | null;
  bl: string | null;
  enseigne: string | null;
  type: string | null;
  agent: string | null;
  ht: string | null;
  ttc: string | null;
  taux: string | null;
  commission: string | null;
  mois: string | null;
  annee: string | null;
}

const EMPTY_MAPPING: DetectedMapping = {
  date: null, bl: null, enseigne: null, type: null,
  agent: null, ht: null, ttc: null, taux: null,
  commission: null, mois: null, annee: null,
};

const FIELDS: { key: keyof DetectedMapping; label: string; required?: boolean; hint: string }[] = [
  { key: 'date', label: 'Date', required: true, hint: 'Date de la vente' },
  { key: 'enseigne', label: 'Enseigne / Client', required: true, hint: 'Nom du client' },
  { key: 'agent', label: 'Agent commercial', hint: 'Nom du commercial' },
  { key: 'type', label: 'Type (Direct/Centrale)', hint: 'Type de vente' },
  { key: 'ht', label: 'Montant HT', hint: 'Chiffre d\'affaires HT' },
  { key: 'ttc', label: 'Montant TTC', hint: 'Chiffre d\'affaires TTC' },
  { key: 'taux', label: 'Taux commission', hint: '7% Direct / 5% Centrale' },
  { key: 'commission', label: 'Commission', hint: 'Calculée si absente' },
  { key: 'bl', label: 'N° BL (optionnel)', hint: 'Si absent, dédoublonnage par date+enseigne+montant' },
  { key: 'mois', label: 'Mois', hint: 'Si absent, déduit de la date' },
  { key: 'annee', label: 'Année', hint: 'Si absent, déduit de la date' },
];

export function ImportDialog({ onImported }: ImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    inserted: number;
    skipped: number;
    detail?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detectedColumns, setDetectedColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<DetectedMapping>(EMPTY_MAPPING);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setResult(null);
      setError(null);
      // Lance la détection
      detectMapping(f);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = Array.from(e.dataTransfer.files).find((f) =>
      /\.(xlsx|xls|ods|csv)$/i.test(f.name)
    );
    if (f) {
      setFile(f);
      setResult(null);
      setError(null);
      detectMapping(f);
    }
  };

  // Étape 1 : détecte les colonnes en envoyant le fichier à /api/import avec detectOnly=true
  // Le serveur renvoie detectedColumns et detectedMapping sans rien insérer
  const detectMapping = async (selectedFile: File) => {
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('detectOnly', 'true');
      // On force un mapping vide pour déclencher l'auto-détection
      formData.append('mapping', JSON.stringify(EMPTY_MAPPING));
      const res = await fetch('/api/import', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.detectedColumns) {
        setDetectedColumns(data.detectedColumns);
      }
      if (data.detectedMapping) {
        setMapping(data.detectedMapping as DetectedMapping);
      }
      // Pas de result ici car on est en mode détection seule
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mapping', JSON.stringify(mapping));
      const res = await fetch('/api/import', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Erreur HTTP ${res.status}`);
      }
      setResult({ ...data.result, detail: data.detail });
      if (data.result.inserted > 0) {
        toast.success('Import réussi', {
          description: data.detail || `${data.result.inserted} nouvelles ventes.`,
        });
        onImported();
      } else {
        toast.info('Aucune nouvelle vente', {
          description: data.detail || 'Toutes les ventes étaient déjà en base.',
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur inconnue';
      setError(msg);
      toast.error('Erreur d\'import', { description: msg });
    } finally {
      setLoading(false);
    }
  };

  const autoDetect = () => {
    // Reset le mapping pour déclencher auto-détection
    setMapping(EMPTY_MAPPING);
    if (file) detectMapping(file);
  };

  const handleClose = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setFile(null);
      setResult(null);
      setError(null);
      setDetectedColumns([]);
      setMapping(EMPTY_MAPPING);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
          <Upload className="h-4 w-4 mr-2" /> Importer mise à jour
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importer le fichier mensuel</DialogTitle>
          <DialogDescription>
            Téléversez votre fichier Excel. La détection des colonnes est automatique.
            Les ventes déjà présentes sont ignorées (par N° BL si présent, sinon par date+enseigne+montant).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Zone de drop */}
          <div
            onDragEnter={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setIsDragging(false);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className={cn(
              'border-2 border-dashed rounded-lg p-5 text-center transition-colors cursor-pointer',
              isDragging
                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20'
                : 'border-slate-300 dark:border-slate-700 hover:border-emerald-400'
            )}
            onClick={() => document.getElementById('import-input')?.click()}
          >
            <input
              id="import-input"
              type="file"
              accept=".xlsx,.xls,.ods,.csv"
              className="hidden"
              onChange={handleFileInput}
            />
            <Upload className="h-8 w-8 mx-auto mb-2 text-emerald-600" />
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {file ? file.name : 'Cliquez ou déposez le fichier ici'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Formats : .xlsx, .xls, .ods, .csv
            </p>
          </div>

          {/* Mapping détecté */}
          {file && detectedColumns.length > 0 && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Correspondance des colonnes
                  </span>
                </div>
                <Button variant="outline" size="sm" onClick={autoDetect} disabled={loading}>
                  <Wand2 className="h-3.5 w-3.5 mr-1" /> Auto-détection
                </Button>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {detectedColumns.length} colonnes détectées : {detectedColumns.join(', ')}
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {FIELDS.map((field) => {
                  const value = mapping[field.key];
                  return (
                    <div key={field.key} className="space-y-1">
                      <Label htmlFor={`map-${field.key}`} className="text-xs font-medium">
                        {field.label}
                        {field.required && <span className="text-rose-500 ml-0.5">*</span>}
                      </Label>
                      <Select
                        value={value ?? '__none__'}
                        onValueChange={(v) =>
                          setMapping({
                            ...mapping,
                            [field.key]: v === '__none__' ? null : v,
                          })
                        }
                      >
                        <SelectTrigger id={`map-${field.key}`} className="h-8 text-xs">
                          <SelectValue placeholder="— Aucune —" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Aucune —</SelectItem>
                          {detectedColumns.map((col) => (
                            <SelectItem key={col} value={col} className="text-xs">
                              {col}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[10px] text-slate-400">{field.hint}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Erreur lors de l'import</AlertTitle>
              <AlertDescription className="text-sm">{error}</AlertDescription>
            </Alert>
          )}

          {result && (
            <Alert
              className={
                result.inserted > 0
                  ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20'
                  : 'border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/20'
              }
            >
              {result.inserted > 0 ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <Info className="h-4 w-4 text-sky-600" />
              )}
              <AlertTitle
                className={
                  result.inserted > 0
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-sky-700 dark:text-sky-400'
                }
              >
                {result.inserted > 0 ? 'Import terminé' : 'Aucune nouvelle vente détectée'}
              </AlertTitle>
              <AlertDescription className="text-sm">
                {result.detail}
              </AlertDescription>
            </Alert>
          )}

          {/* Aide */}
          <details className="text-xs text-slate-500 dark:text-slate-400">
            <summary className="cursor-pointer hover:text-slate-700 dark:hover:text-slate-300">
              Format attendu
            </summary>
            <div className="mt-2 space-y-1 pl-2">
              <p>• Une feuille (n'importe quel nom) avec des en-têtes</p>
              <p>• Colonnes obligatoires : <strong>DATE</strong>, <strong>ENSEIGNE/CLIENT</strong>, <strong>HT ou TTC</strong></p>
              <p>• Colonnes optionnelles : TYPE (Direct/Centrale), AGENT, TAUX, COMMISSION, N° BL, MOIS, ANNÉE</p>
              <p>• Sans N° BL : dédoublonnage par (date + enseigne + type + montant HT)</p>
              <p>• En-têtes détectés automatiquement (ligne 1 à 5)</p>
            </div>
          </details>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={loading}>
            Fermer
          </Button>
          <Button
            onClick={handleImport}
            disabled={!file || loading || !mapping.date || !mapping.enseigne || (!mapping.ht && !mapping.ttc)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Traitement...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" /> Lancer l'import
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
