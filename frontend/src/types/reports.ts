import type { OrderType, PaymentMethod, QuotationStatus } from './common';

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

export interface CategoryReportRow {
  category_name: string;
  quantity: number;
  total: number;
}

export interface PaymentMethodReportRow {
  method: PaymentMethod;
  payment_count: number;
  total: number;
}

export interface PeriodComparison {
  current_total: number;
  previous_total: number;
  previous_start: string;
  previous_end: string;
  percent_change: number | null;
}

export interface QuotationFunnelRow {
  status: QuotationStatus;
  count: number;
}

export type GraphGranularity = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface GraphPoint {
  period: string;
  total: number;
}

export interface GraphSeries {
  metric: 'sales' | 'expense';
  granularity: GraphGranularity;
  series: GraphPoint[];
}

export interface SalesReport {
  start: string;
  end: string;
  grand_total: number;
  breakdown: SalesReportRow[];
  by_order_type: OrderTypeReportRow[];
  top_products: TopProductRow[];
  by_category: CategoryReportRow[];
  by_payment_method: PaymentMethodReportRow[];
  comparison: PeriodComparison;
  quotation_funnel: QuotationFunnelRow[];
  avg_job_turnaround_days: number | null;
}
