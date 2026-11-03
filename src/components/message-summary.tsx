'use client';

import { useState, useMemo, useEffect } from 'react';
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
import { MessageSquare, Copy, Check, Loader2 } from 'lucide-react';
import { formatEuro, formatNumber, monthLabel } from '@/lib/dashboard-service';
import type { DashboardData } from '@/lib/dashboard-types';
import { toast } from 'sonner';

/**
 * Formatage local sans espaces insécables (U+00A0, U+202F, U+2009) qui
 * s'affichent mal dans WhatsApp, SMS, et certains webmails.
 * Remplace par espace normal (U+0020).
 */
function fmtEuroLocal(n: number): string {
  return formatEuro(n).replace(/[\u00A0\u202F\u2009]/g, ' ');
}
function fmtNumLocal(n: number): string {
  return formatNumber(n).replace(/[\u00A0\u202F\u2009]/g, ' ');
}

interface MessageSummaryProps {
  data: DashboardData;
  /** Agent à afficher (null = vue globale) */
  agent?: string | null;
  /** Bouton compact (pour la liste d'agents) ou complet (header) */
  variant?: 'compact' | 'full';
  /** Label du bouton personnalisé */
  buttonLabel?: string;
}

/**
 * Génère un message formaté "prêt à copier-coller" pour envoi par mail/WhatsApp/SMS.
 *
 * Format demandé par l'utilisateur :
 *   CA Total : X€
 *   CA Direct : X€
 *   CA Centrale : X€
 *   NB BL Direct : N
 *   NB BL Centrale : N
 *   NB BL Total : N
 *   Commission totale : X€
 *
 *   Détail des centrales :
 *   • SCACHAP : X€
 *   • OTERA SAS : X€
 *   • SCAOUEST : X€
 *   • ALDOUEST : X€
 *
 *   [+ une petite analyse globale et simple]
 */
export function MessageSummary({ data, agent = null, variant = 'full', buttonLabel }: MessageSummaryProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [colisTotal, setColisTotal] = useState<number | undefined>(undefined);
  const [colisByEnseigne, setColisByEnseigne] = useState<Array<{ enseigne: string; totalColis: number }> | undefined>(undefined);

  // Fetch colis data for the current month
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/volumes/colis-summary?year=${data.kpis.current.year}&month=${data.kpis.current.month}`, { cache: 'no-store' });
        const j = await res.json();
        if (!cancelled && j.ok) {
          setColisTotal(j.grandTotal?.colis || 0);
          setColisByEnseigne((j.data || []).map((d: any) => ({ enseigne: d.enseigne, totalColis: d.totalColis })));
        }
      } catch {
        // Volumes non disponibles
      }
    })();
    return () => { cancelled = true; };
  }, [data.kpis.current.year, data.kpis.current.month]);

  // Construit le texte du message à partir des données du dashboard
  const messageText = useMemo(() => {
    return buildMessageText(data, agent, colisTotal, colisByEnseigne);
  }, [data, agent, colisTotal, colisByEnseigne]);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(messageText);
      setCopied(true);
      toast.success('Message copié dans le presse-papier');
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      // Fallback : sélection manuelle
      const textarea = document.createElement('textarea');
      textarea.value = messageText;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        toast.success('Message copié');
        setTimeout(() => setCopied(false), 2000);
      } catch {
        toast.error('Impossible de copier — sélectionnez le texte manuellement');
      }
      document.body.removeChild(textarea);
    }
  };

  const periodLabel = `${monthLabel(data.kpis.current.month)} ${data.kpis.current.year}`;
  const isAgentSpecific = !!agent;
  const targetLabel = isAgentSpecific ? agent : 'Vue d\'ensemble';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={variant === 'compact' ? 'outline' : 'outline'}
          size="sm"
          className={variant === 'compact'
            ? 'border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
            : 'border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'}
          title={`Message prêt à copier pour ${targetLabel}`}
        >
          <MessageSquare className={variant === 'compact' ? 'h-3.5 w-3.5 mr-1.5' : 'h-4 w-4 mr-2'} />
          {buttonLabel ?? (variant === 'compact' ? `Message ${agent}` : 'Message')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <MessageSquare className="h-5 w-5 inline mr-2 text-emerald-600" />
            Message {isAgentSpecific ? `${agent}` : 'global'} — {periodLabel}
          </DialogTitle>
          <DialogDescription>
            Texte formaté prêt à copier-coller pour envoi par email, WhatsApp ou SMS.
            Cliquez sur « Copier » puis collez où vous voulez.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-border bg-muted/30 p-4 max-h-[55vh] overflow-y-auto">
          <pre className="text-sm whitespace-pre-wrap font-mono leading-relaxed text-foreground">
{messageText}
          </pre>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="px-2 py-1 rounded bg-muted">
            {messageText.length} caractères
          </span>
          <span>•</span>
          <span>{messageText.split('\n').length} lignes</span>
          <span>•</span>
          <span>Période : {periodLabel}</span>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Fermer
          </Button>
          <Button
            onClick={copyToClipboard}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 mr-2" /> Copié !
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-2" /> Copier le message
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Construit le texte du message formaté.
 *
 * Exporté pour permettre des usages futurs (génération server-side, tests, etc.)
 */
export function buildMessageText(data: DashboardData, agent: string | null, colisTotal?: number, colisByEnseigne?: Array<{ enseigne: string; totalColis: number }>): string {
  const isAgentSpecific = !!agent;
  const periodLabel = `${monthLabel(data.kpis.current.month)} ${data.kpis.current.year}`;

  // Récupère les KPI de l'agent (ou globaux si null)
  let kpis: {
    caHT: number; caDirect: number; caCentrale: number;
    nbBl: number; nbBlDirect: number; nbBlCentrale: number;
    commission: number;
  };

  if (isAgentSpecific) {
    const agentStat = data.agents.find((a) => a.agent === agent);
    if (agentStat) {
      kpis = {
        caHT: agentStat.caHT,
        caDirect: agentStat.caDirect,
        caCentrale: agentStat.caCentrale,
        nbBl: agentStat.nbBl,
        nbBlDirect: agentStat.nbBlDirect,
        nbBlCentrale: agentStat.nbBlCentrale,
        commission: agentStat.commission,
      };
    } else {
      // Agent non trouvé dans les données du mois → message vide
      return `Bonjour ${agent},

Aucune vente enregistrée pour ${periodLabel}.

À bientôt,
Kooks`;
    }
  } else {
    kpis = {
      caHT: data.kpis.current.caHT,
      caDirect: data.kpis.current.caDirect,
      caCentrale: data.kpis.current.caCentrale,
      nbBl: data.kpis.current.nbBl,
      nbBlDirect: data.kpis.current.nbBlDirect,
      nbBlCentrale: data.kpis.current.nbBlCentrale,
      commission: data.kpis.current.commission,
    };
  }

  // Détail des centrales pour cet agent (ou globalement)
  // On prend les enseignes de type Centrale, filtrées par agent si spécifié
  const centrales = data.enseignes
    .filter((e) => e.type === 'Centrale')
    .filter((e) => !isAgentSpecific || e.agent === agent)
    .sort((a, b) => b.caHT - a.caHT);

  // Construit les lignes "• ENSEIGNE_COURT : X€ (N colis)"
  // Raccourcit les noms de coopératives pour la lisibilité
  const shortName = (name: string): string => {
    let n = name;
    n = n.replace(/SOCIETE COOPERATIVE D'?APPROVISIONNEMENT PARIS.?EST/i, 'SCAPEST');
    n = n.replace(/SOCIETE COOPERATIVE D'?APPROVISIONNEMENT DE L'?OUEST/i, 'SCAOUEST');
    n = n.replace(/SOCIETE COOPERATIVE D'?APPROVISIONNEMENT RHONE.?ALP/i, 'SOCARA');
    n = n.replace(/SOCIETE COOPERATIVE D'?APPROVISIONNEMENT ILE DE FRANCE/i, 'SCADIF');
    n = n.replace(/SOC COOP APPROVISIONNEMENT PARIS NORD/i, 'SCAPNOR');
    n = n.replace(/CENTRA APPROVI CHARENT POITOU/i, 'SCACHAP');
    n = n.replace(/LECLERC APPROVISIONNEMENT SUD/i, 'LECASUD');
    n = n.replace(/DISTRIBUTION FRANPRIX/i, 'FRANPRIX');
    return n;
  };
  const colisMap = new Map<string, number>();
  if (colisByEnseigne) {
    for (const c of colisByEnseigne) {
      colisMap.set(c.enseigne, c.totalColis);
    }
  }
  const centralesLines = centrales.length > 0
    ? centrales.map((c) => {
        // Cherche les colis pour cette centrale (match exact ou partiel)
        let colis = colisMap.get(c.enseigne) ?? 0;
        if (colis === 0 && colisByEnseigne) {
          const match = colisByEnseigne.find((v) =>
            v.enseigne.includes(c.enseigne) || c.enseigne.includes(v.enseigne)
          );
          if (match) colis = match.totalColis;
        }
        return `• ${shortName(c.enseigne)} : ${fmtEuroLocal(c.caHT)}${colis > 0 ? ` (${colis} colis)` : ''}`;
      }).join('\n')
    : '• (aucune vente Centrale ce mois-ci)';

  // === Petite analyse globale ===
  const analysis = buildAnalysis(data, agent, kpis, centrales, colisTotal);

  // === Construction du message ===
  // Si agent spécifique : "Bonjour {agent},"
  // Si global : "Bonjour,"
  const greeting = isAgentSpecific ? `Bonjour ${agent},` : 'Bonjour,';

  return `${greeting}

Voici le bilan des ventes Kooks pour ${periodLabel} :

CA Total : ${fmtEuroLocal(kpis.caHT)}
CA Direct : ${fmtEuroLocal(kpis.caDirect)}
CA Centrale : ${fmtEuroLocal(kpis.caCentrale)}
NB BL Direct : ${kpis.nbBlDirect}
NB BL Centrale : ${kpis.nbBlCentrale}
NB BL Total : ${kpis.nbBl}

Commission totale : ${fmtEuroLocal(kpis.commission)}

Détail des centrales :
${centralesLines}

${analysis}

Kooks`;
}

/**
 * Génère une courte analyse (3-5 lignes max) avec :
 * - Tendance des ventes Centrales (hausse/baisse/stable vs mois précédent)
 * - Nombre de clients inactifs + date de dernière commande (pas de listing)
 * - Nombre de clients à relancer + date de dernière commande (pas de listing)
 *
 * Format demandé par l'utilisateur : dire s'il y a une baisse au niveau des
 * centrales, et donner les comptes (inactifs / à relancer) avec la date de
 * dernière commande la plus récente (sans lister chaque client).
 */
function buildAnalysis(
  data: DashboardData,
  agent: string | null,
  kpis: { caHT: number; caDirect: number; caCentrale: number; nbBl: number; commission: number },
  centrales: Array<{ enseigne: string; caHT: number; agent: string }>,
  colisTotal?: number,
): string {
  const lines: string[] = [];
  const isAgentSpecific = !!agent;

  // 1. Tendance des ventes Centrales (vs mois précédent)
  //    Pour l'analyse globale : on compare data.kpis.previous.caCentrale à kpis.caCentrale
  //    Pour un agent spécifique : on utilise agent.previous.caCentrale (plus précis que la série mensuelle)
  let centraleTrend = '';
  if (isAgentSpecific) {
    const agentStat = data.agents.find((a) => a.agent === agent);
    // Utilise previous (récupéré spécifiquement pour le mois précédent de cet agent)
    const prevData = (agentStat as any)?.previous as
      | { caCentrale: number; caDirect: number; month: number; year: number; label: string }
      | null | undefined;
    const currentCentrale = kpis.caCentrale;
    if (prevData && prevData.caCentrale > 0) {
      const pct = ((currentCentrale - prevData.caCentrale) / prevData.caCentrale) * 100;
      const sign = pct >= 0 ? '+' : '';
      const trendLabel = pct > 5 ? 'en hausse' : pct < -5 ? 'en baisse' : 'stable';
      centraleTrend = `🏭 Centrales ${trendLabel} (${sign}${pct.toFixed(1)}% vs ${prevData.label || monthLabelShort(prevData.month) + ' ' + prevData.year}).`;
    } else if (prevData && currentCentrale > 0) {
      centraleTrend = `🏭 Centrales : nouvelles ventes ce mois-ci (${fmtEuroLocal(currentCentrale)}), aucune le mois précédent.`;
    } else if (prevData) {
      centraleTrend = `🏭 Centrales : aucune vente ce mois-ci.`;
    } else {
      // Fallback : utilise la série mensuelle si previous n'est pas dispo
      const series = (agentStat as any)?.centraleMonthlySeries as
        | Array<{ year: number; month: number; caCentrale: number; caDirect: number }>
        | undefined;
      if (series && series.length >= 2) {
        const last = series[series.length - 1];
        const prev = series[series.length - 2];
        if (prev.caCentrale > 0) {
          const pct = ((last.caCentrale - prev.caCentrale) / prev.caCentrale) * 100;
          const sign = pct >= 0 ? '+' : '';
          const trendLabel = pct > 5 ? 'en hausse' : pct < -5 ? 'en baisse' : 'stable';
          centraleTrend = `🏭 Centrales ${trendLabel} (${sign}${pct.toFixed(1)}% vs ${monthLabelShort(prev.month)} ${prev.year}).`;
        } else if (last.caCentrale > 0) {
          centraleTrend = `🏭 Centrales : nouvelles ventes ce mois-ci (${fmtEuroLocal(last.caCentrale)}), aucune le mois précédent.`;
        } else {
          centraleTrend = `🏭 Centrales : aucune vente ce mois-ci.`;
        }
      }
    }
  } else {
    // Mode global : utilise data.kpis.previous.caCentrale
    if (data.kpis.previous && data.kpis.previous.caCentrale !== undefined) {
      const currentCentrale = kpis.caCentrale;
      const prevCentrale = data.kpis.previous.caCentrale;
      if (prevCentrale > 0) {
        const pct = ((currentCentrale - prevCentrale) / prevCentrale) * 100;
        const sign = pct >= 0 ? '+' : '';
        const trendLabel = pct > 5 ? 'en hausse' : pct < -5 ? 'en baisse' : 'stable';
        centraleTrend = `🏭 Centrales ${trendLabel} (${sign}${pct.toFixed(1)}% vs ${data.kpis.previous.label}).`;
      } else if (currentCentrale > 0) {
        centraleTrend = `🏭 Centrales : nouvelles ventes ce mois-ci (${fmtEuroLocal(currentCentrale)}), aucune le mois précédent.`;
      } else {
        centraleTrend = `🏭 Centrales : aucune vente ce mois-ci.`;
      }
    }
  }
  if (centraleTrend) lines.push(centraleTrend);

  // 2. Clients inactifs (status = 'INACTIF') — nombre + date de dernière commande (pas de listing)
  //    Filtré par agent si spécifié
  const inactifs = data.customerFollowup.filter(
    (c) => c.status === 'INACTIF' && (!isAgentSpecific || c.agent === agent),
  );
  if (inactifs.length > 0) {
    // Date de dernière commande la plus récente parmi les inactifs
    const dates = inactifs.map((c) => c.lastOrder).filter((d): d is string => !!d);
    if (dates.length > 0) {
      const latestDate = dates.reduce((latest, d) => (d > latest ? d : latest), dates[0]);
      lines.push(`🔴 ${inactifs.length} client(s) inactif(s) — dernière commande le ${formatDateFr(latestDate)}.`);
    } else {
      lines.push(`🔴 ${inactifs.length} client(s) inactif(s).`);
    }
  }

  // 3. Clients à relancer (status = 'A RELANCER') — nombre + date de dernière commande (pas de listing)
  const aRelancer = data.customerFollowup.filter(
    (c) => c.status === 'A RELANCER' && (!isAgentSpecific || c.agent === agent),
  );
  if (aRelancer.length > 0) {
    const dates = aRelancer.map((c) => c.lastOrder).filter((d): d is string => !!d);
    if (dates.length > 0) {
      // Pour les relances, la date la PLUS ANCIENNE est la plus urgente
      const oldestDate = dates.reduce((oldest, d) => (d < oldest ? d : oldest), dates[0]);
      lines.push(`⏰ ${aRelancer.length} client(s) à relancer — dernière commande la plus ancienne le ${formatDateFr(oldestDate)}.`);
    } else {
      lines.push(`⏰ ${aRelancer.length} client(s) à relancer.`);
    }
  }

  // 4. Clients actifs (status = 'OK')
  const actifs = data.customerFollowup.filter(
    (c) => c.status === 'OK' && (!isAgentSpecific || c.agent === agent),
  );
  if (actifs.length > 0) {
    lines.push(`✅ ${actifs.length} client(s) actif(s) ce mois-ci.`);
  }

  // 5. Répartition Direct/Centrale (info complémentaire)
  if (kpis.caHT > 0) {
    const partCentrale = (kpis.caCentrale / kpis.caHT) * 100;
    const partDirect = 100 - partCentrale;
    lines.push(`📊 Répartition : ${partDirect.toFixed(0)}% Direct / ${partCentrale.toFixed(0)}% Centrale.`);
  }

  // 6. Colis vendus (si données de volumes disponibles)
  if (colisTotal && colisTotal > 0) {
    lines.push(`📦 ${colisTotal} colis vendus ce mois-ci.`);
  }

  return lines.length > 0
    ? `Analyse :\n${lines.map((l) => `${l}`).join('\n')}`
    : 'Analyse : données insuffisantes pour ce mois-ci.';
}

/** Format court JJ/MM/AAAA depuis une date ISO YYYY-MM-DD */
function formatDateFr(isoDate: string): string {
  if (!isoDate) return '—';
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return isoDate;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Libellé court du mois (Janv, Févr, etc.) */
function monthLabelShort(month: number): string {
  const labels = ['Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc'];
  return labels[month - 1] ?? `M${month}`;
}
