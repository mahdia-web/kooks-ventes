'use client';

import { useCallback, useState } from 'react';
import { FileSpreadsheet, BarChart3, RefreshCw } from 'lucide-react';
import { FileUpload } from '@/components/file-upload';
import { ColumnMappingCard } from '@/components/column-mapping';
import { KpiCards } from '@/components/kpi-cards';
import {
  SalesByAgentChart,
  SalesByCategoryChart,
  SalesOverTimeChart,
  TopProductsChart,
} from '@/components/charts';
import { SalesTable } from '@/components/sales-table';
import { AgentRanking } from '@/components/agent-ranking';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';
import {
  analyzeSales,
  buildSalesRows,
  guessMapping,
  parseExcelFile,
} from '@/lib/analyzer';
import type {
  AnalysisResult,
  ColumnMapping,
  ParsedSheet,
} from '@/lib/types';
import { EMPTY_MAPPING } from '@/lib/types';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping>(EMPTY_MAPPING);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);

  const handleFileSelected = useCallback(async (selectedFile: File) => {
    setFile(selectedFile);
    setLoading(true);
    setError(null);
    setAnalysis(null);
    setSheets([]);
    setMapping(EMPTY_MAPPING);
    try {
      const parsed = await parseExcelFile(selectedFile);
      if (parsed.length === 0 || parsed[0].rows.length === 0) {
        throw new Error("Le fichier ne contient aucune donnée exploitable.");
      }
      setSheets(parsed);
      setActiveSheetIdx(0);
      const firstSheet = parsed[0];
      const guessed = guessMapping(firstSheet.columns);
      setMapping(guessed);
      // Lancer automatiquement l'analyse sur la première feuille
      const rows = buildSalesRows(firstSheet.rows, guessed);
      const result = analyzeSales(rows);
      setAnalysis(result);
      toast({
        title: 'Fichier chargé avec succès',
        description: `${firstSheet.rows.length} lignes détectées dans la feuille "${firstSheet.sheetName}".`,
      });
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : 'Erreur inconnue';
      setError(`Impossible de lire le fichier : ${msg}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const runAnalysis = useCallback(() => {
    if (!sheets[activeSheetIdx]) return;
    const sheet = sheets[activeSheetIdx];
    if (!mapping.agent || !mapping.amount) {
      setError("Veuillez sélectionner au minimum une colonne 'Agent' et une colonne 'Montant'.");
      return;
    }
    setError(null);
    try {
      const rows = buildSalesRows(sheet.rows, mapping);
      const result = analyzeSales(rows);
      setAnalysis(result);
      toast({
        title: 'Analyse terminée',
        description: `${rows.length} ventes analysées sur ${result.agents.length} agents.`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur inconnue';
      setError(`Erreur lors de l'analyse : ${msg}`);
    }
  }, [sheets, activeSheetIdx, mapping]);

  const handleAutoDetect = useCallback(() => {
    if (!sheets[activeSheetIdx]) return;
    const guessed = guessMapping(sheets[activeSheetIdx].columns);
    setMapping(guessed);
    toast({
      title: 'Détection automatique',
      description: 'Les colonnes ont été réaffectées automatiquement.',
    });
  }, [sheets, activeSheetIdx]);

  const resetAll = useCallback(() => {
    setFile(null);
    setSheets([]);
    setMapping(EMPTY_MAPPING);
    setAnalysis(null);
    setError(null);
    setActiveSheetIdx(0);
  }, []);

  const activeSheet = sheets[activeSheetIdx];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">
                Analyseur de Ventes — Agents Commerciaux
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
                Importez votre fichier Excel et obtenez une analyse complète
              </p>
            </div>
          </div>
          {file && (
            <Button variant="ghost" size="sm" onClick={resetAll} className="text-slate-600">
              <RefreshCw className="h-4 w-4 mr-1" /> Recommencer
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {/* Étape 1 : Upload */}
        <FileUpload onFileSelected={handleFileSelected} fileName={file?.name} disabled={loading} />

        {loading && (
          <Card className="border-emerald-200 dark:border-emerald-900">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
              <p className="text-sm text-slate-700 dark:text-slate-300">
                Lecture du fichier en cours...
              </p>
            </CardContent>
          </Card>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Erreur</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Étape 2 : Mapping (si feuille chargée) */}
        {activeSheet && (
          <div className="space-y-4">
            {sheets.length > 1 && (
              <Tabs
                value={String(activeSheetIdx)}
                onValueChange={(v) => {
                  const idx = parseInt(v, 10);
                  setActiveSheetIdx(idx);
                  const guessed = guessMapping(sheets[idx].columns);
                  setMapping(guessed);
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Feuilles détectées :
                  </span>
                </div>
                <TabsList className="flex flex-wrap h-auto bg-slate-100 dark:bg-slate-900">
                  {sheets.map((s, idx) => (
                    <TabsTrigger
                      key={s.sheetName}
                      value={String(idx)}
                      className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-emerald-700"
                    >
                      {s.sheetName} ({s.rows.length})
                    </TabsTrigger>
                  ))}
                </TabsList>
                {sheets.map((s, idx) => (
                  <TabsContent key={idx} value={String(idx)} className="hidden" />
                ))}
              </Tabs>
            )}

            <ColumnMappingCard
              columns={activeSheet.columns}
              mapping={mapping}
              onMappingChange={setMapping}
              onAutoDetect={handleAutoDetect}
            />

            <div className="flex justify-end">
              <Button
                onClick={runAnalysis}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={!mapping.agent || !mapping.amount}
              >
                <BarChart3 className="h-4 w-4 mr-2" /> Lancer l'analyse
              </Button>
            </div>
          </div>
        )}

        {/* Étape 3 : Résultats */}
        {analysis && (
          <div className="space-y-6 animate-in fade-in-50 duration-500">
            <div className="border-b border-slate-200 dark:border-slate-800 pb-2">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Tableau de bord d'analyse
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Synthèse de l'activité commerciale sur {analysis.totalSalesCount} ventes
              </p>
            </div>

            <KpiCards result={analysis} />

            <Tabs defaultValue="charts" className="space-y-4">
              <TabsList className="bg-slate-100 dark:bg-slate-900">
                <TabsTrigger
                  value="charts"
                  className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-emerald-700"
                >
                  Graphiques
                </TabsTrigger>
                <TabsTrigger
                  value="ranking"
                  className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-emerald-700"
                >
                  Classement
                </TabsTrigger>
                <TabsTrigger
                  value="data"
                  className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-emerald-700"
                >
                  Données détaillées
                </TabsTrigger>
              </TabsList>

              <TabsContent value="charts" className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  <SalesByAgentChart result={analysis} />
                  <SalesByCategoryChart result={analysis} />
                </div>
                <SalesOverTimeChart result={analysis} />
                <TopProductsChart result={analysis} />
              </TabsContent>

              <TabsContent value="ranking" className="space-y-4">
                <AgentRanking agents={analysis.agents} />
              </TabsContent>

              <TabsContent value="data" className="space-y-4">
                <SalesTable rows={analysis.rows} />
              </TabsContent>
            </Tabs>
          </div>
        )}

        {!file && !loading && (
          <Card className="border-dashed border-slate-300 dark:border-slate-700">
            <CardContent className="p-6">
              <div className="space-y-4">
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Comment ça marche ?
                </h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1 p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold dark:bg-emerald-900/30 dark:text-emerald-400">
                        1
                      </span>
                      <span className="font-medium text-sm">Importez</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Téléversez un fichier Excel (.xlsx, .xls, .csv, .ods) contenant vos ventes par agent.
                    </p>
                  </div>
                  <div className="space-y-1 p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold dark:bg-emerald-900/30 dark:text-emerald-400">
                        2
                      </span>
                      <span className="font-medium text-sm">Affectez les colonnes</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      L'outil détecte automatiquement les colonnes Agent, Date, Produit, Montant, etc. Ajustez si besoin.
                    </p>
                  </div>
                  <div className="space-y-1 p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold dark:bg-emerald-900/30 dark:text-emerald-400">
                        3
                      </span>
                      <span className="font-medium text-sm">Analysez</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Visualisez les KPI, graphiques, classements et exportez les données en CSV.
                    </p>
                  </div>
                </div>
                <Alert>
                  <AlertTitle className="text-sm">Conseil</AlertTitle>
                  <AlertDescription className="text-xs">
                    Pour de meilleurs résultats, votre fichier devrait contenir au minimum une colonne pour
                    le nom de l'agent commercial et une colonne pour le montant des ventes. Les colonnes
                    Date, Produit, Catégorie et Quantité enrichiront l'analyse.
                  </AlertDescription>
                </Alert>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 mt-auto">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 text-center text-xs text-slate-500 dark:text-slate-400">
          Analyse 100% locale — vos données ne quittent jamais votre navigateur.
        </div>
      </footer>

      <Toaster />
    </div>
  );
}
