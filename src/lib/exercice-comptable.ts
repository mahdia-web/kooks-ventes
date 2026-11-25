/**
 * Helpers liés à l'exercice comptable Kooks.
 *
 * L'exercice Kooks va du 1er octobre au 30 septembre de l'année suivante.
 * Exemple : l'exercice "2026-2027" commence le 01/10/2026 et se termine le
 * 30/09/2027. L'exercice qui contient une date donnée est dit "en cours".
 */

export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Retourne l'année de début de l'exercice contenant la date donnée.
 * - En oct-déc : exercice commencé cette année (ex: nov 2026 → exercice 2026-2027 → startYear 2026).
 * - En jan-sep : exercice commencé l'année précédente (ex: mars 2026 → exercice 2025-2026 → startYear 2025).
 */
export function exerciceStartYear(date: Date = new Date()): number {
  return date.getMonth() >= 9 ? date.getFullYear() : date.getFullYear() - 1;
}

/**
 * Retourne l'exercice comptable contenant la date donnée (par défaut aujourd'hui).
 * L'exercice "en cours" commence le 01/10/startYear et se termine le 30/09/startYear+1.
 */
export function exerciceEnCours(date: Date = new Date()): DateRange {
  const startYear = exerciceStartYear(date);
  return {
    start: new Date(startYear, 9, 1),    // 1 octobre
    end: new Date(startYear + 1, 8, 30), // 30 septembre
  };
}

/**
 * Retourne l'exercice comptable précédent (celui d'avant l'exercice en cours).
 */
export function exercicePrecedent(date: Date = new Date()): DateRange {
  const startYear = exerciceStartYear(date) - 1;
  return {
    start: new Date(startYear, 9, 1),
    end: new Date(startYear + 1, 8, 30),
  };
}

/**
 * Formate une date en JJ/MM/AAAA (format français attendu par l'API).
 */
export function formatDMY(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}
