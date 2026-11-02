'use client';

import { useState, useMemo } from 'react';
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

  // Construit le texte du message à partir des données du dashboard
  const messageText = useMemo(() => {
    return buildMessageText(data, agent);
  }, [data, agent]);

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
export function buildMessageText(data: DashboardData, agent: string | null): string {
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

  // Construit les lignes "• ENSEIGNE : X€"
  const centralesLines = centrales.length > 0
    ? centrales.map((c) => `• ${c.enseigne} : ${fmtEuroLocal(c.caHT)}`).join('\n')
    : '• (aucune vente Centrale ce mois-ci)';

  // === Petite analyse globale ===
  const analysis = buildAnalysis(data, agent, kpis, centrales);

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
 * - Évolution vs mois précédent (si dispo)
 * - Part Centrale dans le CA
 * - Top enseigne du mois
 * - Nombre de clients actifs
 */
function buildAnalysis(
  data: DashboardData,
  agent: string | null,
  kpis: { caHT: number; caDirect: number; caCentrale: number; nbBl: number; commission: number },
  centrales: Array<{ enseigne: string; caHT: number; agent: string }>,
): string {
  const lines: string[] = [];
  const isAgentSpecific = !!agent;

  // 1. Évolution vs mois précédent (si données dispo)
  if (data.kpis.previous && data.kpis.evolution) {
    const caEvolPct = data.kpis.evolution.caHTPercent;
    const sign = caEvolPct >= 0 ? '+' : '';
    const trend = caEvolPct >= 0 ? 'en hausse' : 'en baisse';
    // Pour un agent spécifique, on ne peut pas utiliser l'évolution globale (qui est calculée sur l'ensemble)
    // Donc on l'affiche seulement en mode global
    if (!isAgentSpecific) {
      lines.push(`📈 Le CA est ${trend} de ${sign}${caEvolPct.toFixed(1)}% vs ${data.kpis.previous.label} (${fmtEuroLocal(data.kpis.previous.caHT)}).`);
    }
  }

  // 2. Part Centrale dans le CA
  if (kpis.caHT > 0) {
    const partCentrale = (kpis.caCentrale / kpis.caHT) * 100;
    const partDirect = 100 - partCentrale;
    lines.push(`📊 Répartition : ${partDirect.toFixed(0)}% Direct / ${partCentrale.toFixed(0)}% Centrale.`);
  }

  // 3. Top enseigne du mois (pour cet agent, ou globale)
  const topEnseignes = data.enseignes
    .filter((e) => !isAgentSpecific || e.agent === agent)
    .sort((a, b) => b.caHT - a.caHT);
  if (topEnseignes.length > 0) {
    const top = topEnseignes[0];
    lines.push(`🥇 Top client : ${top.enseigne} avec ${fmtEuroLocal(top.caHT)} (${top.nbBl} BL).`);
  }

  // 4. Top centrale (si au moins 1)
  if (centrales.length > 0) {
    const topCentrale = centrales[0];
    lines.push(`🏭 Coopérative principale : ${topCentrale.enseigne} (${fmtEuroLocal(topCentrale.caHT)}).`);
  }

  // 5. Nombre de clients actifs
  const activeEnseignes = data.enseignes
    .filter((e) => !isAgentSpecific || e.agent === agent)
    .length;
  if (activeEnseignes > 0) {
    lines.push(`👥 ${activeEnseignes} client(s) actif(s) ce mois-ci.`);
  }

  // 6. Message de fin selon performance
  if (kpis.caHT > 0) {
    const aov = kpis.nbBl > 0 ? kpis.caHT / kpis.nbBl : 0;
    if (aov > 500) {
      lines.push(`✅ Panier moyen solide (${fmtEuroLocal(aov)}), bonne dynamique commerciale.`);
    } else if (aov > 0) {
      lines.push(`💡 Panier moyen : ${fmtEuroLocal(aov)} — opportunité de montée en gamme.`);
    }
  }

  return lines.length > 0
    ? `Analyse :\n${lines.map((l) => `${l}`).join('\n')}`
    : 'Analyse : données insuffisantes pour ce mois-ci.';
}
