'use client';
import { useEffect, useState, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Search, UserCheck, UserX, Store, Users, Trash2, Sparkles, GitMerge, AlertTriangle, CheckSquare, Square, Loader2, XCircle, RotateCcw, Wand2, Stethoscope, Wrench, Download, Package, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { generateClientsPdf } from '@/components/clients-pdf';

interface Agent {
  id: string;
  name: string;
  defaultDirectRate: number;
  defaultCentraleRate: number;
  isActive: boolean;
  email: string | null;
}
interface Enseigne {
  id: string;
  name: string;
  type: string;
  agent: string;
  commissionRate: number | null;
  isActive: boolean;
}

// Mots-clés Centrale (matches the import logic)
const CENTRALE_KEYWORDS = [
  'otera', 'scapest', 'scachap', 'scaouest', 'aldouest',
  'centra approvi', 'cooperative approvisionnement', 'societe cooperative dapprovi',
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`]/g, '')
    .trim();
}

function isCentraleName(name: string): boolean {
  const n = normalize(name);
  return CENTRALE_KEYWORDS.some((kw) => n.includes(kw));
}

interface DuplicateItem {
  id: string;
  name: string;
  type: string;
  agent: string;
  isActive: boolean;
  salesCount?: number;
}
interface DuplicateGroup {
  normalized: string;
  matchType?: 'exact' | 'similar';
  score?: number;
  signature?: string;
  items: DuplicateItem[];
}

interface SettingsPanelProps {
  initialTab?: 'agents' | 'enseignes' | 'doublons';
}

export function SettingsPanel({ initialTab = 'agents' }: SettingsPanelProps = {}) {
  const [tab, setTab] = useState<string>(initialTab);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [enseignes, setEnseignes] = useState<Enseigne[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [merging, setMerging] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'Direct' | 'Centrale' | 'CHR'>('all');
  const [filterAgent, setFilterAgent] = useState<string>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newClient, setNewClient] = useState({
    name: '',
    type: 'Direct',
    agent: '',
    commissionRate: '',
    isActive: true,
  });
  // Sélection multiple pour bulk-update de type
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkType, setBulkType] = useState<'Direct' | 'Centrale' | 'CHR'>('Centrale');
  const [bulkUpdating, setBulkUpdating] = useState(false);
  // Non-doublons déclarés (dismissed) — pour affichage + undo
  const [dismissed, setDismissed] = useState<Array<{
    signature: string;
    ids: string[];
    names: string[];
    reason?: string;
    dismissedAt: string;
  }>>([]);

  const loadDismissed = useCallback(async () => {
    try {
      const url = `/api/enseignes/dismiss-duplicate?_t=${Date.now()}`;
      const r = await fetch(url, { cache: 'no-store' });
      const j = await r.json();
      if (j.ok) setDismissed(j.data);
    } catch {}
  }, []);

  const loadAgents = useCallback(async () => {
    try {
      const r = await fetch('/api/agents', { cache: 'no-store' });
      const j = await r.json();
      if (j.ok) setAgents(j.data);
    } catch {}
  }, []);

  const loadEnseignes = useCallback(async () => {
    try {
      const r = await fetch('/api/enseignes', { cache: 'no-store' });
      const j = await r.json();
      if (j.ok) setEnseignes(j.data);
    } catch {}
  }, []);

  const loadDuplicates = useCallback(async () => {
    try {
      // cache: 'no-store' + cache-busting query param pour éviter toute mise en cache
      const url = `/api/enseignes/detect-duplicates?_t=${Date.now()}`;
      const r = await fetch(url, { cache: 'no-store' });
      const j = await r.json();
      if (j.ok) setDuplicates(j.data);
    } catch {}
  }, []);

  useEffect(() => {
    loadAgents();
    loadEnseignes();
    loadDuplicates();
    loadDismissed();
  }, [loadAgents, loadEnseignes, loadDuplicates, loadDismissed]);

  // Annule un dismiss (restore le groupe dans la détection)
  const restoreDismissed = async (signature: string) => {
    if (!confirm('Restaurer ce groupe dans la détection des doublons ?')) return;
    try {
      const r = await fetch(`/api/enseignes/dismiss-duplicate?signature=${encodeURIComponent(signature)}`, {
        method: 'DELETE',
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      toast.success('Groupe restauré');
      loadDismissed();
      loadDuplicates();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // Migration SEBASTIEN GASNIER : écrase les ventes existantes de SEBASTIEN
  // et insère les 3 nouvelles ventes (AUCHAN MANDELIEU ×2, AUCHAN GRASSE ×1)
  // avec les bonnes données issues de l'ERP de l'utilisateur.
  const [migrating, setMigrating] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [diagnoseResult, setDiagnoseResult] = useState<any>(null);
  const [cleanupResult, setCleanupResult] = useState<any>(null);

  const runSebastienMigration = async () => {
    if (!confirm(
      'Migration SEBASTIEN GASNIER ?\n\n' +
      'Cette action va :\n' +
      '1. Créer l\'agent SEBASTIEN GASNIER (s\'il n\'existe pas)\n' +
      '2. Supprimer TOUTES les ventes avec agent contenant SEBASTIEN/GASNIER\n' +
      '   (uniquement par nom d\'agent — ne touche pas aux BL des autres agents)\n' +
      '3. Insérer 3 nouvelles ventes :\n' +
      '   • AUCHAN MANDELIEU — 02/11/2026 — 575,36€ (BL 26000623)\n' +
      '   • AUCHAN MANDELIEU — 14/10/2026 — 723,84€ (BL 26000435, FV-00428)\n' +
      '   • AUCHAN GRASSE — 07/10/2026 — 459,36€ (BL 26000381, FV-00365)\n' +
      '4. Créer les enseignes AUCHAN MANDELIEU et AUCHAN GRASSE si besoin\n\n' +
      'Le CA total des nouvelles ventes (1 758,56€) remplacera celui des ventes supprimées.\n' +
      'Action atomique (transaction) — tout ou rien.'
    )) return;
    setMigrating(true);
    try {
      const r = await fetch('/api/migrations/sebastien-gasnier', { method: 'POST' });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      toast.success('Migration SEBASTIEN GASNIER terminée', {
        description: `${j.deletedSales} supprimée(s), ${j.insertedSales} insérée(s) — CA ${j.deletedCA.toFixed(2)}€ → ${j.insertedCA.toFixed(2)}€`,
      });
      // Recharge tout + diagnostic pour vérifier
      loadAgents();
      loadEnseignes();
      loadDuplicates();
      setDiagnoseResult(null);
      setCleanupResult(null);
      // Auto-diagnostic après migration
      setTimeout(() => diagnoseSebastien(), 500);
    } catch (e: any) {
      toast.error('Erreur migration', { description: e.message });
    } finally {
      setMigrating(false);
    }
  };

  // Diagnostic : liste toutes les ventes SEBASTIEN/GASNIER et identifie les doublons
  const diagnoseSebastien = async () => {
    setDiagnosing(true);
    setDiagnoseResult(null);
    setCleanupResult(null);
    try {
      const r = await fetch('/api/migrations/sebastien-diagnose', { cache: 'no-store' });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      setDiagnoseResult(j);
      if (j.summary.duplicatesCount > 0) {
        toast.warning(`${j.summary.duplicatesCount} doublon(s) détecté(s)`, {
          description: `${j.summary.totalSales} ventes au total, CA ${j.summary.totalCA.toFixed(2)}€`,
        });
      } else {
        toast.success(`${j.summary.totalSales} vente(s), aucun doublon`, {
          description: `CA total : ${j.summary.totalCA.toFixed(2)}€`,
        });
      }
    } catch (e: any) {
      toast.error('Erreur diagnostic', { description: e.message });
    } finally {
      setDiagnosing(false);
    }
  };

  // Nettoyage : supprime les doublons (garde 1 vente par BL)
  const cleanupSebastien = async () => {
    if (!confirm(
      'Nettoyer les doublons SEBASTIEN ?\n\n' +
      'Pour chaque BL qui a 2+ ventes, garde uniquement la plus récente\n' +
      'et supprime les autres. Les ventes sans BL ne sont pas touchées.'
    )) return;
    setCleaning(true);
    setCleanupResult(null);
    try {
      const r = await fetch('/api/migrations/sebastien-diagnose', { method: 'POST' });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      setCleanupResult(j);
      if (j.deletedCount > 0) {
        toast.success(`${j.deletedCount} doublon(s) supprimé(s)`);
        // Re-diagnostic après nettoyage
        setTimeout(() => diagnoseSebastien(), 500);
      } else {
        toast.info('Aucun doublon à supprimer');
      }
    } catch (e: any) {
      toast.error('Erreur nettoyage', { description: e.message });
    } finally {
      setCleaning(false);
    }
  };

  // === DIAGNOSTIC ENSEIGNE ===
  const [diagnoseQuery, setDiagnoseQuery] = useState('');
  const [diagnoseLoading, setDiagnoseLoading] = useState(false);
  const [diagnoseData, setDiagnoseData] = useState<any>(null);
  const [fixing, setFixing] = useState(false);
  const [showMigrationTools, setShowMigrationTools] = useState(false);
  // === AUDIT CA ===
  const [auditData, setAuditData] = useState<any>(null);
  const [auditLoading, setAuditLoading] = useState(false);

  const runAudit = async () => {
    setAuditLoading(true);
    setAuditData(null);
    try {
      const r = await fetch('/api/audit', { cache: 'no-store' });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      setAuditData(j);
      if (j.summary.status === 'OK') {
        toast.success(`CA total : ${j.summary.totalCA.toFixed(2)}€ — conforme à l'attendu`);
      } else if (j.summary.status === 'CA MANQUANT') {
        toast.error(`CA MANQUANT : ${Math.abs(j.summary.difference).toFixed(2)}€`, {
          description: `Total actuel ${j.summary.totalCA.toFixed(2)}€ vs attendu ${j.summary.expectedCA}€`,
        });
      } else {
        toast.warning(`CA excédentaire : ${j.summary.difference.toFixed(2)}€`);
      }
    } catch (e: any) {
      toast.error('Erreur audit', { description: e.message });
    } finally {
      setAuditLoading(false);
    }
  };

  // === RESTAURATION OCTOBRE 2026 ===
  const [restoring, setRestoring] = useState(false);
  const restoreOctober2026 = async () => {
    if (!confirm(
      'Restaurer les ventes d\'octobre 2026 ?\n\n' +
      'Cette action va :\n' +
      '1. Supprimer TOUTES les ventes existantes d\'octobre 2026\n' +
      '2. Réinsérer 292 ventes à partir du fichier ERP (170 250,64€ HT)\n' +
      '3. Detection intelligente: si l\'ERP a oublié d\'affecter un agent (*)\n' +
      '   mais l\'enseigne est déjà assignée en base, garder cet agent\n' +
      '   (ex: AUCHAN MANDELIEU reste à SEBASTIEN GASNIER meme si ERP dit *)\n' +
      '4. Attribuer les autres ventes * à KOOK\'S\n' +
      '5. Créer l\'agent SEBASTIEN GASNIER si besoin\n\n' +
      'Le CA total sera exactement 170 250,64€ après restauration.'
    )) return;
    setRestoring(true);
    try {
      const r = await fetch('/api/migrations/october-2026', { method: 'POST' });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      toast.success('Restauration terminée', {
        description: `${j.insertedCount} ventes — CA ${j.totalCA.toFixed(2)}€${j.reassignedCount > 0 ? ` — ${j.reassignedCount} réaffectée(s) intelligemment` : ''}`,
      });
      // Recharge tout
      loadAgents();
      loadEnseignes();
      loadDuplicates();
      // Auto-audit pour vérifier
      setTimeout(() => runAudit(), 500);
    } catch (e: any) {
      toast.error('Erreur restauration', { description: e.message });
    } finally {
      setRestoring(false);
    }
  };

  // === EXPORT CSV CLIENTS ===
  const exportClients = (status: 'all' | 'relance' | 'inactif') => {
    const agent = filterAgent === 'all' ? '' : filterAgent;
    const url = `/api/clients/export?status=${status}${agent ? `&agent=${encodeURIComponent(agent)}` : ''}`;
    window.open(url, '_blank');
  };

  // === EXPORT PDF CLIENTS (généré côté client avec jsPDF) ===
  const [generatingClientsPdf, setGeneratingClientsPdf] = useState(false);
  const exportClientsPDF = async () => {
    setGeneratingClientsPdf(true);
    try {
      // Récupère la période courante
      const periodRes = await fetch('/api/period', { cache: 'no-store' });
      const periodJson = await periodRes.json();
      const { year, month } = periodJson.ok ? periodJson.data : { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };

      // Récupère les données dashboard (filtrées par agent si applicable)
      const agentParam = filterAgent === 'all' ? '' : `&agent=${encodeURIComponent(filterAgent)}`;
      const res = await fetch(`/api/dashboard?year=${year}&month=${month}${agentParam}`, { cache: 'no-store' });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);

      // Génère le PDF côté client (import statique)
      await generateClientsPdf({ data: json.data, agentFilter: filterAgent === 'all' ? null : filterAgent });
      toast.success('PDF généré', {
        description: `Clients à relancer et inactifs — ${filterAgent === 'all' ? 'tous agents' : filterAgent}`,
      });
    } catch (e: any) {
      toast.error('Erreur génération PDF', { description: e.message });
    } finally {
      setGeneratingClientsPdf(false);
    }
  };

  // === IMPORT VOLUMES SCAPEST ===
  const [importingVol, setImportingVol] = useState(false);
  const importScapestVolumes = async () => {
    if (!confirm(
      'Importer les volumes SCAPEST (colis) ?\n\n' +
      '185 lignes, 812 colis, 9 650,11€ HT\n' +
      'Clients: SCAPEST CHALONS + SCAPEST TREMERY (BROCARD)\n' +
      'Période: Octobre 2026\n\n' +
      'Supprime les volumes SCAPEST existants pour octobre 2026 puis réinsère.'
    )) return;
    setImportingVol(true);
    try {
      const r = await fetch('/api/migrations/scapest-volumes', { method: 'POST' });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      toast.success('Volumes SCAPEST importés', {
        description: `${j.insertedCount} lignes, ${j.totalColis} colis, ${j.totalHT.toFixed(2)}€`,
      });
    } catch (e: any) {
      toast.error('Erreur import volumes', { description: e.message });
    } finally {
      setImportingVol(false);
    }
  };

  // === SYNC AGENTS (liaison enseignes ↔ ventes) ===
  const [syncData, setSyncData] = useState<any>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const checkSyncIssues = async () => {
    setSyncLoading(true);
    setSyncData(null);
    try {
      const r = await fetch('/api/enseignes/sync-agents', { cache: 'no-store' });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      setSyncData(j);
      if (j.inconsistenciesCount > 0) {
        toast.warning(`${j.inconsistenciesCount} incohérence(s) détectée(s)`, {
          description: 'L\'agent de l\'enseigne ne correspond pas à l\'agent des ventes récentes',
        });
      } else {
        toast.success('Aucune incohérence — toutes les liaisons sont correctes');
      }
    } catch (e: any) {
      toast.error('Erreur', { description: e.message });
    } finally {
      setSyncLoading(false);
    }
  };

  const syncAllAgents = async () => {
    if (!confirm(
      'Synchroniser les agents ?\n\n' +
      'Pour chaque enseigne :\n' +
      '1. Prend l\'agent de la vente la plus récente (source de vérité ERP)\n' +
      '2. Met à jour l\'enseigne avec cet agent\n' +
      '3. Met à jour TOUTES les ventes de cette enseigne (agent + type + rate + commission)\n\n' +
      'Cela garantit que la feuille clients et la feuille ventes sont liées correctement.\n' +
      'Ex: SCAOUEST sera attribuée à CAP FRAIS partout (plus à BROCARD).'
    )) return;
    setSyncing(true);
    try {
      const r = await fetch('/api/enseignes/sync-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      toast.success(`${j.totalSynced} enseigne(s) synchronisée(s)`, {
        description: `${j.totalSalesUpdated} ventes mises à jour`,
      });
      // Recharge tout
      loadAgents();
      loadEnseignes();
      loadDuplicates();
      // Re-check
      setTimeout(() => checkSyncIssues(), 500);
    } catch (e: any) {
      toast.error('Erreur sync', { description: e.message });
    } finally {
      setSyncing(false);
    }
  };

  const runDiagnose = async () => {
    if (!diagnoseQuery.trim()) return;
    setDiagnoseLoading(true);
    setDiagnoseData(null);
    try {
      const r = await fetch(`/api/enseignes/diagnose?name=${encodeURIComponent(diagnoseQuery.trim())}`, { cache: 'no-store' });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      setDiagnoseData(j);
      if (j.issues && j.issues.length > 0) {
        toast.info(`${j.issues.length} point(s) d'attention`);
      } else if (j.exactMatch) {
        toast.success(`"${j.exactMatch.name}" analysé — aucun problème`);
      }
    } catch (e: any) {
      toast.error('Erreur diagnostic', { description: e.message });
    } finally {
      setDiagnoseLoading(false);
    }
  };

  // Correction du type d'une enseigne (Direct → Centrale, etc.)
  const fixEnseigneType = async (name: string, newType: 'Direct' | 'Centrale' | 'CHR') => {
    if (!confirm(
      `Forcer le type "${newType}" pour "${name}" ?\n\n` +
      `Cela va :\n` +
      `1. Changer le type de l'enseigne\n` +
      `2. Mettre à jour TOUTES les ventes (type + taux + commission recalculée)\n` +
      `Action atomique (transaction).`
    )) return;
    setFixing(true);
    try {
      const r = await fetch('/api/enseignes/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fix_type', name, newType }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      toast.success(`"${name}" → type "${newType}"`, {
        description: `${j.salesUpdated} ventes mises à jour (taux ${j.newRate * 100}%)`,
      });
      // Re-diagnostic pour confirmer
      runDiagnose();
      loadEnseignes();
      loadDuplicates();
    } catch (e: any) {
      toast.error('Erreur correction', { description: e.message });
    } finally {
      setFixing(false);
    }
  };

  const addAgent = async () => {
    const name = prompt('Nom du nouvel agent :');
    if (!name?.trim()) return;
    try {
      const r = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          defaultDirectRate: 0.07,
          defaultCentraleRate: 0.05,
        }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      toast.success(`Agent "${name}" ajouté`);
      loadAgents();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const deleteAgent = async (id: string, name: string) => {
    if (!confirm(`Supprimer l'agent "${name}" ? Ses ventes resteront en base mais sans rattachement.`)) return;
    try {
      const r = await fetch(`/api/agents/${id}`, { method: 'DELETE' });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      toast.success(`Agent supprimé`);
      loadAgents();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const updateAgent = async (id: string, updates: Partial<Agent>) => {
    try {
      const r = await fetch(`/api/agents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      setAgents((p) => p.map((a) => (a.id === id ? { ...a, ...updates } : a)));
      // Si on a changé un taux, recharger aussi les enseignes pour que le total commission soit à jour
      if ('defaultDirectRate' in updates || 'defaultCentraleRate' in updates) {
        toast.success('Taux mis à jour — ventes recalculées', {
          description: 'Toutes les ventes existantes ont été recalculées avec le nouveau taux',
        });
        setTimeout(() => loadEnseignes(), 500);
      }
    } catch (e: any) {
      toast.error(e.message);
      loadAgents();
    }
  };

  const updateEnseigne = async (id: string, updates: Partial<Enseigne>) => {
    try {
      const r = await fetch(`/api/enseignes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      setEnseignes((p) => p.map((e) => (e.id === id ? { ...e, ...updates } : e)));
      toast.success('Modifié');
    } catch (e: any) {
      toast.error(e.message);
      loadEnseignes();
    }
  };

  // Bulk update : change le type de plusieurs enseignes en un seul appel API
  // (utilise UPDATE SQL natif pour recalculer les commissions en masse — instantané
  // même pour 30+ MONOPRIX avec des milliers de ventes)
  const bulkUpdateType = async () => {
    if (selectedIds.size === 0) {
      toast.error('Sélectionnez au moins un client');
      return;
    }
    const ids = Array.from(selectedIds);
    if (!confirm(
      `Changer le type de ${ids.length} client(s) vers « ${bulkType} » ?\n\n` +
      `Toutes leurs ventes seront mises à jour (type + agent + taux + commission recalculée).\n` +
      `Action instantanée grâce à un UPDATE SQL en masse.`
    )) return;
    setBulkUpdating(true);
    try {
      const r = await fetch('/api/enseignes/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, type: bulkType }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      toast.success(`${j.updated.enseignes} client(s) mis à jour`, {
        description: `${j.updated.sales} ventes recalculées en masse (SQL UPDATE)`,
      });
      setSelectedIds(new Set());
      // Recharge les données
      loadEnseignes();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBulkUpdating(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((e) => e.id)));
    }
  };

  // Modification du nom d'un client : auto-détecte le type Centrale si le nom contient
  // un mot-clé comme SCAOUEST, SCACHAP, ALDOUEST, OTERA, etc.
  const updateEnseigneName = async (id: string, newName: string, oldName: string, currentType: string) => {
    if (newName.trim() === oldName || !newName.trim()) return;
    const updates: Partial<Enseigne> = { name: newName.trim() };
    // Auto-détection Centrale : si le nouveau nom contient un mot-clé → Centrale
    if (isCentraleName(newName) && currentType !== 'Centrale') {
      updates.type = 'Centrale';
      toast.success(`Nom modifié → type auto-détecté : Centrale`, {
        description: 'Le nom contient un mot-clé de coopérative',
      });
    }
    await updateEnseigne(id, updates);
  };

  const mergeGroup = async (group: DuplicateGroup, canonicalId: string) => {
    const duplicateIds = group.items.filter((i) => i.id !== canonicalId).map((i) => i.id);
    if (duplicateIds.length === 0) {
      toast.error('Aucun doublon à fusionner');
      return;
    }
    const canonical = group.items.find((i) => i.id === canonicalId);
    if (!confirm(
      `Fusionner ${duplicateIds.length} doublon(s) dans "${canonical?.name}" ?\n\n` +
      `Les ${duplicateIds.length} doublons seront supprimés et toutes leurs ventes seront rattachées au nom canonique.\n` +
      `Type/Agent du client canonique seront appliqués aux ventes fusionnées.`
    )) return;
    setMerging((p) => ({ ...p, [group.normalized]: true }));
    try {
      const r = await fetch('/api/enseignes/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canonicalId, duplicateIds }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      toast.success(`${j.deletedCount} doublon(s) fusionné(s)`, {
        description: `${j.salesUpdated} ventes mises à jour vers "${j.canonical}"`,
      });
      // Recharge tout
      loadEnseignes();
      loadDuplicates();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setMerging((p) => ({ ...p, [group.normalized]: false }));
    }
  };

  // Marque un groupe comme "PAS un doublon" — l'utilisateur a validé que les
  // enseignes sont des magasins distincts (par exemple 2 AUCHAN en villes
  // différentes). Le groupe disparaît de la liste des doublons à valider.
  const dismissGroup = async (group: DuplicateGroup) => {
    const names = group.items.map((i) => i.name).join(' ≠ ');
    if (!confirm(
      `Marquer ces ${group.items.length} clients comme "PAS des doublons" ?\n\n` +
      `${names}\n\n` +
      `Ils seront considérés comme des magasins distincts et ce groupe ne sera plus proposé.\n` +
      `Vous pourrez annuler cette décision via la liste "Non-doublons déclarés" ci-dessous.`
    )) return;
    setMerging((p) => ({ ...p, [group.normalized + '_dismiss']: true }));
    try {
      const r = await fetch('/api/enseignes/dismiss-duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: group.items.map((i) => i.id),
          reason: 'Magasins distincts validés par l\'utilisateur',
        }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      toast.success('Marqué comme non-doublon', {
        description: `${group.items.length} clients conservés séparément`,
      });
      loadDuplicates();
      loadDismissed();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setMerging((p) => ({ ...p, [group.normalized + '_dismiss']: false }));
    }
  };

  const deleteEnseigne = async (id: string, name: string) => {
    if (!confirm(`Supprimer "${name}" ?\n\nATTENTION: toutes les ventes et volumes liés à ce client seront définitivement supprimés.\n\nCette action est irréversible.`)) return;
    try {
      const res = await fetch(`/api/enseignes/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      toast.success(`Client supprimé`, {
        description: `${json.deleted.sales} ventes et ${json.deleted.volumes} volumes supprimés`,
      });
      loadEnseignes();
      loadDuplicates();
    } catch (e: any) { toast.error(e.message); }
  };

  const addClient = async () => {
    if (!newClient.name.trim()) {
      toast.error('Nom requis');
      return;
    }
    // Auto-détection Centrale
    let type = newClient.type;
    if (isCentraleName(newClient.name) && type !== 'Centrale') {
      type = 'Centrale';
      toast.info('Type auto-détecté : Centrale (mot-clé détecté dans le nom)');
    }
    try {
      const rate = newClient.commissionRate ? parseFloat(newClient.commissionRate) / 100 : null;
      const r = await fetch('/api/enseignes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newClient.name.trim(),
          type,
          agent: newClient.agent || "KOOK'S",
          commissionRate: rate,
          isActive: newClient.isActive,
        }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      toast.success(`Client ajouté`);
      setNewClient({ name: '', type: 'Direct', agent: '', commissionRate: '', isActive: true });
      setShowAddForm(false);
      loadEnseignes();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const filtered = enseignes
    .filter((e) => {
      if (filterType === 'Direct') return e.type === 'Direct';
      if (filterType === 'Centrale') return e.type === 'Centrale';
      if (filterType === 'CHR') return e.type === 'CHR';
      return true;
    })
    .filter((e) => {
      // Filtre par agent (sélecteur de commercial)
      if (filterAgent === 'all') return true;
      return e.agent === filterAgent;
    })
    .filter(
      (e) =>
        !search.trim() ||
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        e.agent.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-4">
      <TabsList className="bg-muted">
        <TabsTrigger
          value="agents"
          className="data-[state=active]:bg-card data-[state=active]:text-primary"
        >
          <Users className="h-4 w-4 mr-2" /> Commerciaux ({agents.length})
        </TabsTrigger>
        <TabsTrigger
          value="enseignes"
          className="data-[state=active]:bg-card data-[state=active]:text-primary"
        >
          <Store className="h-4 w-4 mr-2" /> Clients ({enseignes.length})
        </TabsTrigger>
        {(duplicates.length > 0 || dismissed.length > 0) && (
          <TabsTrigger
            value="doublons"
            className="data-[state=active]:bg-card data-[state=active]:text-primary"
          >
            <GitMerge className="h-4 w-4 mr-2" /> Doublons ({duplicates.length})
          </TabsTrigger>
        )}
      </TabsList>

      {/* === ONGLET COMMERCIAUX === */}
      <TabsContent value="agents" className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Règle Kooks : <strong>7% sur le CA Direct</strong> et{' '}
            <strong>5% sur le CA Centrale</strong>. Cliquez sur les taux pour les modifier.
            Tout changement de taux est <strong>propagé aux ventes existantes</strong> de cet agent.
          </p>
          <Button onClick={addAgent} size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4 mr-2" /> Nouvel agent
          </Button>
        </div>
        <div className="rounded-md border border-border overflow-y-auto max-h-[60vh]">
          <Table>
            <TableHeader className="sticky top-0 bg-muted z-10">
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead className="text-right">Taux Direct</TableHead>
                <TableHead className="text-right">Taux Centrale</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-center">Statut</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.map((a) => (
                <TableRow key={a.id} className={!a.isActive ? 'opacity-50' : ''}>
                  <TableCell className="font-medium">
                    <Input
                      defaultValue={a.name}
                      onBlur={(e) => {
                        if (e.target.value !== a.name) {
                          updateAgent(a.id, { name: e.target.value });
                          toast.success(`Renommé`);
                        }
                      }}
                      className="border-0 px-0 py-0 h-auto focus:bg-muted"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <TauxInput
                      value={a.defaultDirectRate}
                      onChange={(v) => updateAgent(a.id, { defaultDirectRate: v })}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <TauxInput
                      value={a.defaultCentraleRate}
                      onChange={(v) => updateAgent(a.id, { defaultCentraleRate: v })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      defaultValue={a.email ?? ''}
                      placeholder="email@exemple.fr"
                      onBlur={(e) => updateAgent(a.id, { email: e.target.value })}
                      className="border-0 px-0 py-0 h-auto focus:bg-muted"
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Switch
                        checked={a.isActive}
                        onCheckedChange={(c) => {
                          updateAgent(a.id, { isActive: c });
                          toast.success(c ? `Réactivé` : `Désactivé`);
                        }}
                      />
                      {a.isActive ? (
                        <UserCheck className="h-4 w-4 text-primary" />
                      ) : (
                        <UserX className="h-4 w-4 text-destructive" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteAgent(a.id, a.name)}
                      title="Supprimer"
                      className="h-7 w-7 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </TabsContent>

      {/* === ONGLET CLIENTS === */}
      <TabsContent value="enseignes" className="space-y-3">
        {/* === EXPORT CSV + PDF CLIENTS === */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            onClick={exportClientsPDF}
            disabled={generatingClientsPdf}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            title="Génère un PDF avec les clients à relancer et inactifs"
          >
            {generatingClientsPdf ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <FileDown className="h-3.5 w-3.5 mr-1.5" />
            )}
            {generatingClientsPdf ? 'Génération...' : 'PDF Clients à relancer'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => exportClients('relance')}
            className="border-amber-500 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-950/50"
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            CSV à relancer
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => exportClients('inactif')}
            className="border-red-500 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/50"
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            CSV inactifs
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => exportClients('all')}
            className="border-primary text-primary hover:bg-primary/10"
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            CSV tous
          </Button>
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher..."
                className="pl-8 w-full sm:w-64"
              />
            </div>
            <Select value={filterType} onValueChange={(v: any) => setFilterType(v)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous types</SelectItem>
                <SelectItem value="Direct">Direct</SelectItem>
                <SelectItem value="Centrale">Centrale</SelectItem>
                <SelectItem value="CHR">CHR</SelectItem>
              </SelectContent>
            </Select>
            {/* Sélecteur d'agent (filtre par commercial) */}
            <Select value={filterAgent} onValueChange={(v) => setFilterAgent(v)}>
              <SelectTrigger className="w-44">
                <div className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-primary" />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les agents</SelectItem>
                {agents.filter((a) => a.isActive).map((a) => (
                  <SelectItem key={a.id} value={a.name}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              {filtered.length} client{filtered.length > 1 ? 's' : ''}
            </span>
          </div>
          <Button
            onClick={() => setShowAddForm(!showAddForm)}
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4 mr-1" /> Nouveau client
          </Button>
        </div>

        <div className="rounded-md border border-primary/30 bg-primary/5 p-2 flex items-start gap-2">
          <Sparkles className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">
            <strong>Détection auto Centrale :</strong> si le nom du client contient
            « SCAOUEST », « SCACHAP », « ALDOUEST », « SCAPEST », « OTERA » ou
            « Coopérative d'approvisionnement », il sera automatiquement marqué comme
            <strong> Centrale</strong> et ne sera jamais considéré comme inactif.
          </p>
        </div>

        {showAddForm && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Nom du client *</Label>
                <Input
                  value={newClient.name}
                  onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                  placeholder="Ex: NOUVEAU MAGASIN"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Type</Label>
                <Select
                  value={newClient.type}
                  onValueChange={(v) => setNewClient({ ...newClient, type: v })}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Direct">Direct</SelectItem>
                    <SelectItem value="Centrale">Centrale</SelectItem>
                    <SelectItem value="CHR">CHR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Agent</Label>
                <Select
                  value={newClient.agent || '__none__'}
                  onValueChange={(v) =>
                    setNewClient({ ...newClient, agent: v === '__none__' ? '' : v })
                  }
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Aucun —</SelectItem>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.name}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Taux marge %</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={newClient.commissionRate}
                  onChange={(e) =>
                    setNewClient({ ...newClient, commissionRate: e.target.value })
                  }
                  placeholder="Auto si vide"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1 flex flex-col justify-end">
                <Label className="text-xs font-medium">Actif</Label>
                <div className="flex items-center gap-2 h-8">
                  <Switch
                    checked={newClient.isActive}
                    onCheckedChange={(c) =>
                      setNewClient({ ...newClient, isActive: c })
                    }
                  />
                  <span className="text-xs text-muted-foreground">
                    {newClient.isActive ? 'Actif' : 'Inactif'}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowAddForm(false)}>
                Annuler
              </Button>
              <Button
                size="sm"
                onClick={addClient}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="h-4 w-4 mr-1" /> Ajouter
              </Button>
            </div>
          </div>
        )}

        {/* === TOOLBAR SÉLECTION MULTIPLE (bulk type reassign) === */}
        {selectedIds.size > 0 && (
          <div className="rounded-lg border border-primary bg-primary/10 p-3 flex items-center gap-3 flex-wrap sticky top-0 z-20">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <CheckSquare className="h-5 w-5 text-primary shrink-0" />
              <span className="text-sm font-medium">
                {selectedIds.size} client(s) sélectionné(s)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Forcer le type :</span>
              <Select value={bulkType} onValueChange={(v: any) => setBulkType(v)}>
                <SelectTrigger className="w-32 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Direct">Direct</SelectItem>
                  <SelectItem value="Centrale">Centrale</SelectItem>
                  <SelectItem value="CHR">CHR</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={bulkUpdateType}
                disabled={bulkUpdating}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {bulkUpdating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                {bulkUpdating ? 'Maj en cours...' : `Forcer ${bulkType}`}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelectedIds(new Set())}
              >
                Annuler
              </Button>
            </div>
          </div>
        )}

        <div className="rounded-md border border-border overflow-y-auto max-h-[55vh]">
          <Table>
            <TableHeader className="sticky top-0 bg-muted z-10">
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={filtered.length > 0 && selectedIds.size === filtered.length}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead>Client</TableHead>
                <TableHead className="w-28">Type</TableHead>
                <TableHead className="w-28">Agent</TableHead>
                <TableHead className="text-right w-20">Taux</TableHead>
                <TableHead className="text-center w-20">Actif</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e) => (
                <TableRow key={e.id} className={!e.isActive ? 'opacity-50' : ''}>
                  <TableCell className="pr-0">
                    <Checkbox
                      checked={selectedIds.has(e.id)}
                      onCheckedChange={() => toggleSelect(e.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium text-sm">
                    <Input
                      defaultValue={e.name}
                      onBlur={(ev) =>
                        updateEnseigneName(e.id, ev.target.value, e.name, e.type)
                      }
                      className="border-0 px-0 py-0 h-auto focus:bg-muted text-sm"
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={e.type}
                      onValueChange={(v) => updateEnseigne(e.id, { type: v as any })}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Direct">Direct</SelectItem>
                        <SelectItem value="Centrale">Centrale</SelectItem>
                        <SelectItem value="CHR">CHR</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={e.agent}
                      onValueChange={(v) => updateEnseigne(e.id, { agent: v })}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {agents.map((a) => (
                          <SelectItem key={a.id} value={a.name}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    {(() => {
                      // Calcule le taux affiché depuis l'agent de ce client
                      const clientAgent = agents.find((a) => a.name === e.agent);
                      const defaultRate = e.type === 'Direct'
                        ? (clientAgent?.defaultDirectRate ?? 0.07)
                        : (clientAgent?.defaultCentraleRate ?? 0.05);
                      const effectiveRate = e.commissionRate ?? defaultRate;
                      const isCustom = e.commissionRate !== null && e.commissionRate !== undefined;
                      return (
                        <div className="flex flex-col items-end gap-0.5">
                          <TauxInput
                            value={effectiveRate}
                            nullable
                            onChange={(v) => updateEnseigne(e.id, { commissionRate: v })}
                          />
                          {isCustom && (
                            <span className="text-[9px] text-amber-600 dark:text-amber-400">
                              personnalisé
                            </span>
                          )}
                          {!isCustom && clientAgent && (
                            <span className="text-[9px] text-muted-foreground">
                              de {clientAgent.name}
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Switch
                        checked={e.isActive}
                        onCheckedChange={(c) => updateEnseigne(e.id, { isActive: c })}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteEnseigne(e.id, e.name)}
                        className="h-7 w-7 text-destructive hover:bg-destructive/10 ml-1"
                        title="Supprimer ce client et toutes ses ventes"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

      </TabsContent>

      {/* === ONGLET DOUBLONS DÉTECTÉS === */}
      <TabsContent value="doublons" className="space-y-3">
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3 flex items-start gap-2">
          <Sparkles className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">
            <strong>Détection intelligente :</strong> les noms sont normalisés (suppression des préfixes SA/SAS/SARL,
            O'TERA = OTERA, formes longues coopératives → acronyme comme SCAPEST/SCAOUEST, variantes de villes
            comme CHALLON EN CHAMPAGNE = CHALONS, dédoublonnage des tokens répétés).
            Les groupes ci-dessous contiennent des clients qui sont <strong>probablement le même magasin</strong> sous des écritures différentes.
            Sélectionnez le nom canonique à garder, puis cliquez sur « Fusionner ».
            Toutes les ventes, volumes et charges seront rattachés au nom canonique.
          </p>
        </div>

        {duplicates.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <GitMerge className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">
              {dismissed.length > 0
                ? `Aucun doublon à valider. ${dismissed.length} groupe(s) marqué(s) "non-doublon" ci-dessous.`
                : 'Aucun doublon détecté. Base propre ! 🎉'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {duplicates.map((group) => (
              <DuplicateGroupCard
                key={group.normalized}
                group={group}
                merging={!!merging[group.normalized]}
                dismissing={!!merging[group.normalized + '_dismiss']}
                onMerge={(canonicalId) => mergeGroup(group, canonicalId)}
                onDismiss={() => dismissGroup(group)}
              />
            ))}
          </div>
        )}

        {/* === NON-DOUBLONS DÉCLARÉS (avec possibilité d'annuler) === */}
        {dismissed.length > 0 && (
          <div className="mt-6 rounded-md border border-muted-foreground/20 bg-muted/30 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium text-muted-foreground">
                  Non-doublons déclarés ({dismissed.length})
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Ces groupes ont été marqués comme magasins distincts
              </p>
            </div>
            <div className="space-y-1.5">
              {dismissed.map((d) => (
                <div
                  key={d.signature}
                  className="flex items-center justify-between gap-2 p-2 rounded border border-border bg-card"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">
                      {d.names.join(' ≠ ')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {d.reason} • {new Date(d.dismissedAt).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => restoreDismissed(d.signature)}
                    title="Restaurer ce groupe dans la détection"
                    className="text-muted-foreground hover:bg-muted"
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1" />
                    Restaurer
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}

function TauxInput({
  value,
  onChange,
  nullable = false,
}: {
  value: number;
  onChange: (v: number) => void;
  nullable?: boolean;
}) {
  const [v, setV] = useState(String((value * 100).toFixed(2)));
  useEffect(() => {
    setV(String((value * 100).toFixed(2)));
  }, [value]);
  return (
    <Input
      type="number"
      step="0.1"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const n = parseFloat(v);
        if (!isNaN(n)) onChange(n / 100);
        else if (nullable) onChange(0);
      }}
      className="h-7 w-16 text-xs text-right"
    />
  );
}

/**
 * Carte affichant un groupe de doublons détectés avec choix du nom canonique.
 */
function DuplicateGroupCard({
  group,
  merging,
  dismissing,
  onMerge,
  onDismiss,
}: {
  group: DuplicateGroup;
  merging: boolean;
  dismissing: boolean;
  onMerge: (canonicalId: string) => void;
  onDismiss: () => void;
}) {
  // Par défaut, on sélectionne le client qui a le PLUS de ventes comme canonique
  const [canonicalId, setCanonicalId] = useState<string>(
    group.items.slice().sort((a, b) => {
      const salesA = a.salesCount ?? 0;
      const salesB = b.salesCount ?? 0;
      if (salesA !== salesB) return salesB - salesA;
      const aHasPrefix = /^(SAS|SA|SARL|EURL|SASU)\b/i.test(a.name) ? 1 : 0;
      const bHasPrefix = /^(SAS|SA|SARL|EURL|SASU)\b/i.test(b.name) ? 1 : 0;
      if (aHasPrefix !== bHasPrefix) return aHasPrefix - bHasPrefix;
      return a.name.length - b.name.length;
    })[0]?.id ?? group.items[0].id
  );

  const matchTypeLabel = group.matchType === 'similar'
    ? `Similaire (${((group.score ?? 0) * 100).toFixed(0)}%)`
    : 'Exact (normalisé)';
  const matchTypeColor = group.matchType === 'similar'
    ? 'text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400'
    : 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400';
  const totalSales = group.items.reduce((s, i) => s + (i.salesCount ?? 0), 0);

  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      <div className="px-3 py-2 bg-muted/50 border-b border-border flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">
              {group.items.length} doublons → « {group.normalized} »
            </p>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${matchTypeColor}`}>
                {matchTypeLabel}
              </span>
              {totalSales > 0 && <span>• {totalSales} ventes cumulées</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onDismiss}
            disabled={dismissing || merging}
            className="border-muted-foreground/30 text-muted-foreground hover:bg-muted"
            title="Marquer comme magasins distincts (pas un doublon)"
          >
            <XCircle className="h-3.5 w-3.5 mr-1.5" />
            {dismissing ? '...' : 'Pas un doublon'}
          </Button>
          <Button
            size="sm"
            onClick={() => onMerge(canonicalId)}
            disabled={merging || dismissing}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <GitMerge className="h-3.5 w-3.5 mr-1.5" />
            {merging ? 'Fusion...' : 'Fusionner'}
          </Button>
        </div>
      </div>

      <div className="p-3 space-y-2">
        <p className="text-xs font-medium text-muted-foreground">
          Sélectionnez le nom canonique à conserver (ou cliquez « Pas un doublon » si ce sont des magasins distincts) :
        </p>
        <div className="space-y-1.5">
          {group.items.map((item) => {
            const isCanonical = item.id === canonicalId;
            return (
              <label
                key={item.id}
                className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${
                  isCanonical
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:bg-muted/50'
                }`}
              >
                <input
                  type="radio"
                  name={`group-${group.normalized}`}
                  checked={isCanonical}
                  onChange={() => setCanonicalId(item.id)}
                  className="accent-primary"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <span>{item.type}</span>
                    <span>•</span>
                    <span>{item.agent || "KOOK'S"}</span>
                    <span>•</span>
                    <span>{item.isActive ? 'Actif' : 'Inactif'}</span>
                    {(item.salesCount ?? 0) > 0 && (
                      <>
                        <span>•</span>
                        <span className="font-medium">{item.salesCount} ventes</span>
                      </>
                    )}
                  </p>
                </div>
                {isCanonical && (
                  <span className="text-[10px] font-medium text-primary bg-primary/15 px-1.5 py-0.5 rounded whitespace-nowrap">
                    À GARDER
                  </span>
                )}
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
