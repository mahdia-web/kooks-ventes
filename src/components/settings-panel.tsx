'use client';
import { useEffect, useState, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Search, UserCheck, UserX, Store, Users, Trash2, Sparkles, GitMerge, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

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
}
interface DuplicateGroup {
  normalized: string;
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
  const [filterType, setFilterType] = useState<'all' | 'Direct' | 'Centrale'>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newClient, setNewClient] = useState({
    name: '',
    type: 'Direct',
    agent: '',
    commissionRate: '',
    isActive: true,
  });

  const loadAgents = useCallback(async () => {
    try {
      const r = await fetch('/api/agents');
      const j = await r.json();
      if (j.ok) setAgents(j.data);
    } catch {}
  }, []);

  const loadEnseignes = useCallback(async () => {
    try {
      const r = await fetch('/api/enseignes');
      const j = await r.json();
      if (j.ok) setEnseignes(j.data);
    } catch {}
  }, []);

  const loadDuplicates = useCallback(async () => {
    try {
      const r = await fetch('/api/enseignes/detect-duplicates');
      const j = await r.json();
      if (j.ok) setDuplicates(j.data);
    } catch {}
  }, []);

  useEffect(() => {
    loadAgents();
    loadEnseignes();
    loadDuplicates();
  }, [loadAgents, loadEnseignes, loadDuplicates]);

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
          agent: newClient.agent || 'Inconnu',
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
      return true;
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
        {duplicates.length > 0 && (
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
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="Direct">Direct</SelectItem>
                <SelectItem value="Centrale">Centrale</SelectItem>
              </SelectContent>
            </Select>
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

        <div className="rounded-md border border-border overflow-y-auto max-h-[55vh]">
          <Table>
            <TableHeader className="sticky top-0 bg-muted z-10">
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead className="w-28">Type</TableHead>
                <TableHead className="w-28">Agent</TableHead>
                <TableHead className="text-right w-20">Taux</TableHead>
                <TableHead className="text-center w-16">Actif</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e) => (
                <TableRow key={e.id} className={!e.isActive ? 'opacity-50' : ''}>
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
                    <Switch
                      checked={e.isActive}
                      onCheckedChange={(c) => updateEnseigne(e.id, { isActive: c })}
                    />
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
            <strong>Détection intelligente :</strong> les noms sont normalisés (suppression des préfixes SA/SAS/SARL, O'TERA = OTERA, formes longues coopératives → acronyme comme SCAOUEST).
            Les groupes ci-dessous contiennent des clients qui sont <strong>probablement le même magasin</strong> sous des écritures différentes.
            Sélectionnez le nom canonique à garder, puis cliquez sur « Fusionner ».
            Toutes les ventes seront rattachées au nom canonique.
          </p>
        </div>

        {duplicates.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <GitMerge className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Aucun doublon détecté. Base propre ! 🎉</p>
          </div>
        ) : (
          <div className="space-y-3">
            {duplicates.map((group) => (
              <DuplicateGroupCard
                key={group.normalized}
                group={group}
                merging={!!merging[group.normalized]}
                onMerge={(canonicalId) => mergeGroup(group, canonicalId)}
              />
            ))}
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
  onMerge,
}: {
  group: DuplicateGroup;
  merging: boolean;
  onMerge: (canonicalId: string) => void;
}) {
  // Par défaut, on sélectionne le 1er item comme canonique (le plus court nom souvent)
  const [canonicalId, setCanonicalId] = useState<string>(
    // Choisir automatiquement le nom le plus "propre" : le plus court non-préfixé
    group.items.slice().sort((a, b) => {
      // Privilégier les noms sans "SAS" / "SA" / "SARL" en début
      const aHasPrefix = /^(SAS|SA|SARL|EURL|SASU)\b/i.test(a.name) ? 1 : 0;
      const bHasPrefix = /^(SAS|SA|SARL|EURL|SASU)\b/i.test(b.name) ? 1 : 0;
      if (aHasPrefix !== bHasPrefix) return aHasPrefix - bHasPrefix;
      // Sinon le plus court
      return a.name.length - b.name.length;
    })[0]?.id ?? group.items[0].id
  );

  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      <div className="px-3 py-2 bg-muted/50 border-b border-border flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">
              {group.items.length} doublons → « {group.normalized} »
            </p>
            <p className="text-xs text-muted-foreground">
              Forme normalisée commune détectée
            </p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => onMerge(canonicalId)}
          disabled={merging}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <GitMerge className="h-3.5 w-3.5 mr-1.5" />
          {merging ? 'Fusion en cours...' : 'Fusionner'}
        </Button>
      </div>

      <div className="p-3 space-y-2">
        <p className="text-xs font-medium text-muted-foreground">
          Sélectionnez le nom canonique à conserver :
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
                  <p className="text-xs text-muted-foreground">
                    {item.type} • {item.agent || 'Inconnu'} •{' '}
                    {item.isActive ? 'Actif' : 'Inactif'}
                  </p>
                </div>
                {isCanonical && (
                  <span className="text-[10px] font-medium text-primary bg-primary/15 px-1.5 py-0.5 rounded">
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
