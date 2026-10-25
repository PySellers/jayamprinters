export interface SalesReportRow {
  date: string;
  invoice_count: number;
  total: number;
}

export interface SalesReport {
  start: string;
  end: string;
  grand_total: number;
  breakdown: SalesReportRow[];
}

export type StatementGroup = 'day' | 'week' | 'month';

export interface StatementRow {
  period_start: string;
  label: string;
  invoices: number;
  sales: number;
  gst_collected: number;
  sales_incl_gst: number;
  purchases: number;
  outsource_cost: number;
  other_expenses: number;
  total_costs: number;
  profit: number;
  margin_percent: number | null;
  collected: number;
  paid_out: number;
}

export interface FinancialStatement {
  start: string;
  end: string;
  group: StatementGroup;
  rows: StatementRow[];
  totals: Omit<StatementRow, 'period_start' | 'label'>;
  receivable: number;
  payable: number;
}
