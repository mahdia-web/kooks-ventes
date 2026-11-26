import { db } from '@/lib/db';

/**
 * Détection d'une catégorie "Salaires" (paie interne, charges sociales).
 *
 * IMPORTANT : on cible les VRAIS salaires mensuels récurrents, PAS le personnel
 * extérieur / intérim (qui sont des factures ponctuelles et ne doivent pas être
 * projetés sur tous les mois). On exclut donc explicitement "personnel extérieur".
 */
export const isSalairesCat = (cat: string) => {
  const c = cat || '';
  if (/personnel extérieur|intérim|interim/i.test(c)) return false;
  return /salaire|rémunération|paie/i.test(c);
};

export interface SalaireBaseLine {
  id: string;
  category: string;
  subLabel: string | null;
  vendor: string | null;
  date: Date;
  amountHT: number;        // montant MENSUEL de base
  amountTTC: number;       // montant MENSUEL de base
  vatRate: number | null;
  allocationMethod: string;
  excludedFromMargin: boolean;
}

/**
 * Charge la BASE SALARIALE MENSUELLE de référence, indépendamment de toute période.
 *
 * Les salaires sont saisis une fois (ex: base d'octobre) et représentent un
 * montant MENSUEL récurrent. On ne peut donc pas filtrer par date — sinon
 * changer de mois ferait disparaître l'affectation, et une période multi-mois
 * ne multiplierait pas la base.
 *
 * On récupère toutes les lignes salaires, puis on conserve la plus récente par
 * `subLabel` (clé de regroupement). Le flag `excludedFromMargin` et le montant
 * sont portés par la base → persistants sur tous les mois.
 */
export async function getSalairesBase(): Promise<SalaireBaseLine[]> {
  const all = await db.charge.findMany({
    where: { category: { not: '' } },
    select: {
      id: true, category: true, subLabel: true, vendor: true, date: true,
      amountHT: true, amountTTC: true, vatRate: true,
      allocationMethod: true, excludedFromMargin: true,
    },
  });
  const salaires = all.filter(c => isSalairesCat(c.category));

  // Conserve la ligne la plus récente par subLabel (ou category si pas de subLabel).
  const baseMap = new Map<string, typeof salaires[number]>();
  for (const c of salaires) {
    const key = c.subLabel ?? c.category;
    const cur = baseMap.get(key);
    if (!cur || c.date.getTime() > cur.date.getTime()) {
      baseMap.set(key, c);
    }
  }
  return Array.from(baseMap.values())
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

/**
 * Nombre de mois couverts par une période [start, end] (inclusif).
 * Ex: 01/10 → 31/10 = 1 mois ; 01/08 → 30/11 = 4 mois.
 */
export function nbMoisPeriode(start: Date, end: Date): number {
  const n = (end.getFullYear() - start.getFullYear()) * 12
    + (end.getMonth() - start.getMonth()) + 1;
  return Math.max(1, n);
}
