import type { OrderType } from './common';

export interface SalesReportRow {
  date: string;
  invoice_count: number;
  total: number;
}

export interface OrderTypeReportRow {
  order_type: OrderType;
  invoice_count: number;
  total: number;
}

export interface TopProductRow {
  product_name: string;
  quantity: number;
  total: number;
}

export interface SalesReport {
  start: string;
  end: string;
  grand_total: number;
  breakdown: SalesReportRow[];
  by_order_type: OrderTypeReportRow[];
  top_products: TopProductRow[];
}
