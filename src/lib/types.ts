// Types pour l'analyse des ventes

export interface SalesRow {
  agent: string;
  date: string | null;
  product: string;
  category: string | null;
  quantity: number;
  amount: number;
  [key: string]: string | number | null;
}

export interface ParsedSheet {
  rows: Record<string, unknown>[];
  columns: string[];
  sheetName: string;
}

export interface ColumnMapping {
  agent: string | null;
  date: string | null;
  product: string | null;
  category: string | null;
  quantity: string | null;
  amount: string | null;
}

export interface AgentStat {
  agent: string;
  totalAmount: number;
  totalQuantity: number;
  salesCount: number;
  averageSale: number;
  share: number;
}

export interface ProductStat {
  product: string;
  totalAmount: number;
  totalQuantity: number;
  salesCount: number;
}

export interface TimePoint {
  period: string;
  amount: number;
  quantity: number;
}

export interface CategoryStat {
  category: string;
  totalAmount: number;
  totalQuantity: number;
  share: number;
}

export interface AnalysisResult {
  rows: SalesRow[];
  agents: AgentStat[];
  products: ProductStat[];
  categories: CategoryStat[];
  timeSeries: TimePoint[];
  totalAmount: number;
  totalQuantity: number;
  totalSalesCount: number;
  averageSale: number;
  topAgent: AgentStat | null;
  topProduct: ProductStat | null;
  dateRange: { start: string | null; end: string | null };
}

export const EMPTY_MAPPING: ColumnMapping = {
  agent: null,
  date: null,
  product: null,
  category: null,
  quantity: null,
  amount: null,
};
