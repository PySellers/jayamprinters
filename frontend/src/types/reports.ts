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
