'use client';

import { useState, useEffect } from 'react';
import {
  Upload,
  Loader2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Info,
  Wand2,
  Lock,
  User,
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
import { Switch } from '@/components/ui/switch';
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
  { key: 'agent', label: 'Agent commercial', hint: 'Nom du commercial (colonne)' },
  { key: 'type', label: 'Type (Direct/Centrale)', hint: 'Type de vente (colonne)' },
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

  // NOUVEAU : options d'override (forceType, forceAgent, replaceDuplicates)
  const [forceType, setForceType] = useState<string>('auto'); // 'auto' | 'Direct' | 'Centrale'
  const [forceAgent, setForceAgent] = useState<string>(''); // '' = auto, sinon nom de l'agent
  const [replaceDuplicates, setReplaceDuplicates] = useState(false);

  // Liste des agents disponibles (chargée depuis l'API)
  const [availableAgents, setAvailableAgents] = useState<string[]>([]);

  useEffect(() => {
    if (open && availableAgents.length === 0) {
      fetch('/api/agents')
        .then((r) => r.json())
        .then((j) => {
          if (j.ok && Array.isArray(j.data)) {
            setAvailableAgents(
              j.data.filter((a: { isActive: boolean; name: string }) => a.isActive).map((a: { name: string }) => a.name)
            );
          }
        })
        .catch(() => {});
    }
  }, [open, availableAgents.length]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setResult(null);
      setError(null);
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

  const detectMapping = async (selectedFile: File) => {
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('detectOnly', 'true');
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
      // NOUVEAU : envoie forceType, forceAgent, replaceDuplicates
      if (forceType && forceType !== 'auto') {
        formData.append('forceType', forceType);
      }
      if (forceAgent) {
        formData.append('forceAgent', forceAgent);
      }
      if (replaceDuplicates) {
        formData.append('replaceDuplicates', 'true');
      }
      const res = await fetch('/api/import', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Erreur HTTP ${res.status}`);
      }
      setResult({ ...data.result, detail: data.detail });
      if (data.result.inserted > 0 || (data.result.updated ?? 0) > 0) {
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
      setForceType('auto');
      setForceAgent('');
      setReplaceDuplicates(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Upload className="h-4 w-4 mr-2" /> Importer
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importer un fichier mensuel</DialogTitle>
          <DialogDescription>
            Téléversez votre fichier Excel. La détection des colonnes est automatique.
            Si votre fichier contient un seul agent ou un seul type de ventes, vous pouvez forcer
            l'affectation pour toutes les lignes (case « Remplacer » ci-dessous).
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
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/60'
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
            <Upload className="h-8 w-8 mx-auto mb-2 text-primary" />
            <p className="text-sm font-medium">
              {file ? file.name : 'Cliquez ou déposez le fichier ici'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Formats : .xlsx, .xls, .ods, .csv
            </p>
          </div>

          {/* NOUVEAU : Options d'override (forceType + forceAgent + replaceDuplicates) */}
          {file && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Options d'affectation</span>
                <span className="text-xs text-muted-foreground">
                  (utile si le fichier est uniforme — pas un mélange d'agents/types)
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {/* Force Type */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium flex items-center gap-1">
                    <Wand2 className="h-3 w-3" /> Forcer le type pour toutes les lignes
                  </Label>
                  <Select value={forceType} onValueChange={setForceType}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">🔀 Auto (détecté depuis nom/colonne)</SelectItem>
                      <SelectItem value="Direct">.Direct (7%)</SelectItem>
                      <SelectItem value="Centrale">Centrale (5%)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">
                    Si le fichier ne contient que des ventes Direct (ou Centrale), forcez le type ici.
                  </p>
                </div>

                {/* Force Agent */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium flex items-center gap-1">
                    <User className="h-3 w-3" /> Forcer l'agent pour toutes les lignes
                  </Label>
                  <Select value={forceAgent || '__auto__'} onValueChange={(v) => setForceAgent(v === '__auto__' ? '' : v)}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__auto__">🔀 Auto (détecté depuis colonne/référence)</SelectItem>
                      {availableAgents.map((a) => (
                        <SelectItem key={a} value={a}>{a}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">
                    Si le fichier est celui d'un seul commercial, forcez l'agent ici.
                  </p>
                </div>
              </div>

              {/* Replace duplicates */}
              <div className="flex items-start gap-3 pt-2 border-t border-border">
                <Switch
                  checked={replaceDuplicates}
                  onCheckedChange={setReplaceDuplicates}
                  id="replace-dup"
                />
                <div className="flex-1">
                  <Label htmlFor="replace-dup" className="text-xs font-medium cursor-pointer">
                    Remplacer les doublons existants (au lieu d'ignorer)
                  </Label>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Si une vente avec le même N° BL (ou même date+enseigne+montant) existe déjà,
                    elle sera mise à jour au lieu d'être ignorée.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Mapping détecté */}
          {file && detectedColumns.length > 0 && (
            <div className="rounded-lg border border-border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">
                    Correspondance des colonnes
                  </span>
                </div>
                <Button variant="outline" size="sm" onClick={autoDetect} disabled={loading}>
                  <Wand2 className="h-3.5 w-3.5 mr-1" /> Auto-détection
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {detectedColumns.length} colonnes détectées : {detectedColumns.join(', ')}
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {FIELDS.map((field) => {
                  const value = mapping[field.key];
                  // Si forceType/forceAgent est activé, on grise la colonne correspondante
                  const isOverridden =
                    (field.key === 'type' && forceType !== 'auto') ||
                    (field.key === 'agent' && forceAgent !== '');
                  return (
                    <div key={field.key} className={cn('space-y-1', isOverridden && 'opacity-50')}>
                      <Label htmlFor={`map-${field.key}`} className="text-xs font-medium">
                        {field.label}
                        {field.required && <span className="text-destructive ml-0.5">*</span>}
                        {isOverridden && <span className="ml-1 text-[10px] text-primary">(forcé)</span>}
                      </Label>
                      <Select
                        value={value ?? '__none__'}
                        onValueChange={(v) =>
                          setMapping({
                            ...mapping,
                            [field.key]: v === '__none__' ? null : v,
                          })
                        }
                        disabled={isOverridden}
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
                      <p className="text-[10px] text-muted-foreground">{field.hint}</p>
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
                  ? 'border-primary/30 bg-primary/5'
                  : 'border-border bg-muted'
              }
            >
              {result.inserted > 0 ? (
                <CheckCircle2 className="h-4 w-4 text-primary" />
              ) : (
                <Info className="h-4 w-4 text-muted-foreground" />
              )}
              <AlertTitle>
                {result.inserted > 0 ? 'Import terminé' : 'Aucune nouvelle vente détectée'}
              </AlertTitle>
              <AlertDescription className="text-sm">{result.detail}</AlertDescription>
            </Alert>
          )}

          {/* Aide */}
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer hover:text-foreground">
              Format attendu
            </summary>
            <div className="mt-2 space-y-1 pl-2">
              <p>• Une feuille (n'importe quel nom) avec des en-têtes</p>
              <p>• Colonnes obligatoires : <strong>DATE</strong>, <strong>ENSEIGNE/CLIENT</strong>, <strong>HT ou TTC</strong></p>
              <p>• Colonnes optionnelles : TYPE (Direct/Centrale), AGENT, TAUX, COMMISSION, N° BL, MOIS, ANNÉE</p>
              <p>• Sans N° BL : dédoublonnage par (date + enseigne + type + montant HT + agent)</p>
              <p>• En-têtes détectés automatiquement (ligne 1 à 5)</p>
              <p>• Règle Kooks : <strong>7% sur le CA Direct</strong>, <strong>5% sur le CA Centrale</strong></p>
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
            className="bg-primary text-primary-foreground hover:bg-primary/90"
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
