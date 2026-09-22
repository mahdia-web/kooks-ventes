'use client';

import { useState } from 'react';
import { Upload, Loader2, AlertCircle, CheckCircle2, RefreshCw, Info } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ImportDialogProps {
  onImported: () => void;
}

export function ImportDialog({ onImported }: ImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    inserted: number;
    skipped: number;
    total: number;
    detail?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setResult(null);
      setError(null);
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

  const handleClose = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setFile(null);
      setResult(null);
      setError(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
          <Upload className="h-4 w-4 mr-2" /> Importer mise à jour
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Importer le fichier mensuel</DialogTitle>
          <DialogDescription>
            Téléversez votre fichier Excel mis à jour. Seules les nouvelles ventes (basées sur le N° BL unique) seront ajoutées.
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
              'border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer',
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
              Format : .xlsx, .xls, .ods, .csv
            </p>
          </div>

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
              <AlertDescription className="text-sm space-y-1">
                {result.detail && <p>{result.detail}</p>}
                {result.errors && result.errors.length > 0 && (
                  <p className="text-xs text-rose-600">
                    Erreurs : {result.errors.join(' | ')}
                  </p>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Aide */}
          <details className="text-xs text-slate-500 dark:text-slate-400">
            <summary className="cursor-pointer hover:text-slate-700 dark:hover:text-slate-300">
              Format attendu
            </summary>
            <div className="mt-2 space-y-1 pl-2">
              <p>• Feuille nommée <strong>VENTES</strong> (ou toute feuille si non trouvée)</p>
              <p>• Colonnes attendues (ordre indifférent) :</p>
              <ul className="list-disc list-inside pl-2 space-y-0.5">
                <li><strong>DATE</strong> — date de la vente (obligatoire)</li>
                <li><strong>N° BL</strong> — numéro unique du bon de livraison (obligatoire)</li>
                <li><strong>ENSEIGNE</strong> — nom du client</li>
                <li><strong>TYPE</strong> — Direct ou Centrale</li>
                <li><strong>AGENT</strong> — nom du commercial</li>
                <li><strong>MT HT</strong>, <strong>MT TTC</strong> — montants</li>
                <li><strong>TAUX</strong>, <strong>COMMISSION</strong></li>
                <li><strong>MOIS</strong>, <strong>ANNÉE</strong></li>
              </ul>
              <p>• Les en-têtes sont détectés automatiquement (ligne 1 à 5)</p>
              <p>• Les ventes déjà en base (N° BL identique) sont ignorées</p>
            </div>
          </details>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={loading}
          >
            Fermer
          </Button>
          <Button
            onClick={handleImport}
            disabled={!file || loading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Import...
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
