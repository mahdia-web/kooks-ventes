import * as XLSX from 'xlsx';
import type {
  AnalysisResult,
  AgentStat,
  ProductStat,
  CategoryStat,
  TimePoint,
  ColumnMapping,
  ParsedSheet,
  SalesRow,
} from './types';

// Normalise une valeur en nombre
function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    // Retirer les espaces et gérer les formats français (1 234,56 ou 1,234.56)
    const cleaned = value
      .replace(/\s/g, '')
      .replace(/€/g, '')
      .replace(/[$£]/g, '');
    // Si on a à la fois virgule et point, on suppose que la virgule est le séparateur de milliers
    if (/,/.test(cleaned) && /\./.test(cleaned)) {
      const normalized = cleaned.replace(/,/g, '');
      const n = parseFloat(normalized);
      return isNaN(n) ? 0 : n;
    }
    // Sinon, la virgule est probablement un séparateur décimal
    const withDot = cleaned.replace(/,/g, '.');
    const n = parseFloat(withDot);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

// Normalise une date en chaîne ISO YYYY-MM-DD
function toDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    return value.toISOString().split('T')[0];
  }
  if (typeof value === 'number') {
    // Probablement un numéro de série Excel
    // Excel epoch: 1899-12-30
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(epoch.getTime() + value * 86400000);
    return date.toISOString().split('T')[0];
  }
  if (typeof value === 'string') {
    // Essayer de parser
    const trimmed = value.trim();
    // Format DD/MM/YYYY ou DD-MM-YYYY
    const dmy = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
    if (dmy) {
      const day = dmy[1].padStart(2, '0');
      const month = dmy[2].padStart(2, '0');
      let year = dmy[3];
      if (year.length === 2) year = '20' + year;
      return `${year}-${month}-${day}`;
    }
    // Format YYYY-MM-DD
    const ymd = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (ymd) {
      return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
    }
    // Essayer le parsing standard
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  }
  return null;
}

// Lit un fichier Excel et retourne toutes les feuilles
export async function parseExcelFile(file: File): Promise<ParsedSheet[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheets: ParsedSheet[] = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      raw: true,
      defval: null,
    });
    const columns = data.length > 0 ? Object.keys(data[0]) : [];
    return {
      rows: data,
      columns,
      sheetName: name,
    };
  });
  return sheets;
}

// Devine le mapping des colonnes en fonction des noms d'en-têtes
export function guessMapping(columns: string[]): ColumnMapping {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

  const mapping: ColumnMapping = {
    agent: null,
    date: null,
    product: null,
    category: null,
    quantity: null,
    amount: null,
  };

  // Helper : 'exact' pour les mots complets (avec \b final),
  // 'stem' pour les radicaux (préfixes, sans \b final, pour gérer les pluriels/déclinaisons)
  const matchPattern = (text: string, exact: string[] = [], stems: string[] = []) => {
    for (const w of exact) {
      if (new RegExp(`\\b${w}\\b`, 'i').test(text)) return true;
    }
    for (const s of stems) {
      if (new RegExp(`\\b${s}`, 'i').test(text)) return true;
    }
    return false;
  };

  for (const col of columns) {
    const n = normalize(col);
    if (
      !mapping.agent &&
      matchPattern(
        n,
        ['agent', 'agents', 'vendeur', 'vendeurs', 'salesperson'],
        ['commercial']
      )
    ) {
      mapping.agent = col;
    }
    if (
      !mapping.date &&
      matchPattern(n, ['date', 'dates', 'jour', 'jours', 'mois', 'annee', 'annees', 'periode', 'timestamp'])
    ) {
      mapping.date = col;
    }
    if (
      !mapping.product &&
      matchPattern(
        n,
        ['produit', 'produits', 'article', 'articles', 'item', 'items', 'product', 'products', 'libelle', 'designation']
      )
    ) {
      mapping.product = col;
    }
    if (
      !mapping.category &&
      (matchPattern(n, [], ['categor', 'famille', 'segment']) ||
        matchPattern(n, ['type', 'groupe', 'groupes']))
    ) {
      mapping.category = col;
    }
    if (
      !mapping.quantity &&
      matchPattern(
        n,
        ['quantite', 'qte', 'qty', 'quantity', 'nombre', 'volume', 'unite', 'unites'],
        []
      )
    ) {
      mapping.quantity = col;
    }
    if (
      !mapping.amount &&
      (matchPattern(n, ['montant', 'ca', 'chiffre', 'prix', 'amount', 'revenue', 'valorisation']) ||
        matchPattern(n, [], ['total']))
    ) {
      mapping.amount = col;
    }
  }

  // Si aucune colonne agent n'est trouvée, on prend la première colonne
  if (!mapping.agent) {
    mapping.agent = columns[0] ?? null;
  }
  // Si aucune colonne montant, on essaie de réutiliser la quantité
  if (!mapping.amount) {
    mapping.amount = mapping.quantity;
  }

  return mapping;
}

// Construit les lignes normalisées à partir des données brutes et du mapping
export function buildSalesRows(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping
): SalesRow[] {
  return rows.map((row) => {
    const agentRaw = mapping.agent ? row[mapping.agent] : null;
    const dateRaw = mapping.date ? row[mapping.date] : null;
    const productRaw = mapping.product ? row[mapping.product] : null;
    const categoryRaw = mapping.category ? row[mapping.category] : null;
    const quantityRaw = mapping.quantity ? row[mapping.quantity] : null;
    const amountRaw = mapping.amount ? row[mapping.amount] : null;

    return {
      ...Object.fromEntries(
        Object.entries(row).map(([k, v]) => [k, v as string | number | null])
      ),
      agent: agentRaw === null || agentRaw === undefined ? 'Inconnu' : String(agentRaw),
      date: toDate(dateRaw),
      product:
        productRaw === null || productRaw === undefined
          ? 'Inconnu'
          : String(productRaw),
      category:
        categoryRaw === null || categoryRaw === undefined
          ? null
          : String(categoryRaw),
      quantity: toNumber(quantityRaw),
      amount: toNumber(amountRaw),
    } as SalesRow;
  });
}

// Calcule l'analyse complète à partir des lignes normalisées
export function analyzeSales(rows: SalesRow[]): AnalysisResult {
  const totalAmount = rows.reduce((sum, r) => sum + r.amount, 0);
  const totalQuantity = rows.reduce((sum, r) => sum + r.quantity, 0);
  const totalSalesCount = rows.length;
  const averageSale = totalSalesCount > 0 ? totalAmount / totalSalesCount : 0;

  // Statistiques par agent
  const agentMap = new Map<string, AgentStat>();
  for (const row of rows) {
    const key = row.agent || 'Inconnu';
    const stat = agentMap.get(key) ?? {
      agent: key,
      totalAmount: 0,
      totalQuantity: 0,
      salesCount: 0,
      averageSale: 0,
      share: 0,
    };
    stat.totalAmount += row.amount;
    stat.totalQuantity += row.quantity;
    stat.salesCount += 1;
    agentMap.set(key, stat);
  }
  const agents = Array.from(agentMap.values())
    .map((a) => ({
      ...a,
      averageSale: a.salesCount > 0 ? a.totalAmount / a.salesCount : 0,
      share: totalAmount > 0 ? (a.totalAmount / totalAmount) * 100 : 0,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  // Statistiques par produit
  const productMap = new Map<string, ProductStat>();
  for (const row of rows) {
    const key = row.product || 'Inconnu';
    const stat = productMap.get(key) ?? {
      product: key,
      totalAmount: 0,
      totalQuantity: 0,
      salesCount: 0,
    };
    stat.totalAmount += row.amount;
    stat.totalQuantity += row.quantity;
    stat.salesCount += 1;
    productMap.set(key, stat);
  }
  const products = Array.from(productMap.values()).sort(
    (a, b) => b.totalAmount - a.totalAmount
  );

  // Statistiques par catégorie
  const categoryMap = new Map<string, CategoryStat>();
  for (const row of rows) {
    const key = row.category || 'Sans catégorie';
    const stat = categoryMap.get(key) ?? {
      category: key,
      totalAmount: 0,
      totalQuantity: 0,
      share: 0,
    };
    stat.totalAmount += row.amount;
    stat.totalQuantity += row.quantity;
    categoryMap.set(key, stat);
  }
  const categories = Array.from(categoryMap.values())
    .map((c) => ({
      ...c,
      share: totalAmount > 0 ? (c.totalAmount / totalAmount) * 100 : 0,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  // Série temporelle
  const timeMap = new Map<string, TimePoint>();
  const dateRows = rows.filter((r) => r.date);
  for (const row of dateRows) {
    if (!row.date) continue;
    // Grouper par mois YYYY-MM
    const month = row.date.slice(0, 7);
    const stat = timeMap.get(month) ?? {
      period: month,
      amount: 0,
      quantity: 0,
    };
    stat.amount += row.amount;
    stat.quantity += row.quantity;
    timeMap.set(month, stat);
  }
  const timeSeries = Array.from(timeMap.values()).sort((a, b) =>
    a.period.localeCompare(b.period)
  );

  // Plage de dates
  const dates = dateRows
    .map((r) => r.date)
    .filter((d): d is string => d !== null)
    .sort();
  const dateRange = {
    start: dates.length > 0 ? dates[0] : null,
    end: dates.length > 0 ? dates[dates.length - 1] : null,
  };

  return {
    rows,
    agents,
    products,
    categories,
    timeSeries,
    totalAmount,
    totalQuantity,
    totalSalesCount,
    averageSale,
    topAgent: agents[0] ?? null,
    topProduct: products[0] ?? null,
    dateRange,
  };
}

// Formate un nombre en monnaie EUR
export function formatEuro(value: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(value);
}

// Formate un nombre avec séparateurs de milliers
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('fr-FR').format(value);
}

// Formate un pourcentage
export function formatPercent(value: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(value / 100);
}
