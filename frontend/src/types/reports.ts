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

// ---- AI Insights (admin only) --------------------------------------------------
export interface InsightMonth { month: string; label: string; revenue: number; orders: number; delivered: number; partial: boolean }
export interface InsightForecastMonth { month: string; label: string; revenue: number; low: number; high: number }
export interface InsightService {
  name: string; revenue: number; share: number | null; orders: number; quantity: number; avg_order_value: number;
  trend_percent: number | null; discount_percent: number | null; jobs: number; delivered: number;
  on_time_percent: number | null; avg_turnaround_days: number | null; urgent_percent: number | null;
}
export interface InsightEmployee {
  user_id: number; name: string; role: string; steps_done: number; jobs_touched: number; avg_minutes: number | null;
  speed_vs_team: number | null; rework: number; rework_percent: number | null; working_now: number; waiting_on_them: number;
  on_hold: number; score: number | null; rank?: number;
}
export interface InsightWorkCenter {
  name: string; color?: string | null; steps_done: number; avg_minutes: number | null; avg_wait_minutes: number | null;
  open_now: number; backlog_hours: number;
}
export interface InsightRisk {
  job_card_id: number; job_number: string; customer: string; service: string; due_date: string; predicted_finish: string;
  days_late: number; already_late: boolean; steps_left: number; stuck_at: string | null; urgent: boolean;
}
export interface InsightTip { kind: 'risk' | 'opportunity' | 'insight' | 'good' | 'info'; area: string; title: string; detail: string; metric?: string | null }

export interface Insights {
  generated_at: string;
  period: { start: string; end: string; days: number };
  headline: {
    revenue: number; revenue_change_percent: number | null; orders: number; avg_order_value: number; on_time_percent: number | null;
    avg_turnaround_days: number | null; open_jobs: number; overdue_jobs: number; delivered_jobs: number; receivable: number;
    repeat_customer_percent: number | null; active_customers: number; new_customers: number; discount_given: number;
    discount_percent: number | null; outsource_cost: number; purchases: number;
  };
  monthly: InsightMonth[];
  forecast: {
    method: string; confidence: 'low' | 'medium' | 'high'; trend: 'up' | 'down' | 'flat'; growth_percent: number | null;
    this_month_projection: number; this_month_so_far: number; months: InsightForecastMonth[];
  };
  weekdays: { day: string; orders: number; revenue: number }[];
  services: InsightService[];
  customers: {
    top: { name: string; revenue: number; orders: number; share: number | null; last_order: string | null }[];
    top3_share: number | null;
    dormant: { name: string; phone?: string | null; last_order: string; days_since: number; lifetime_revenue: number; orders: number }[];
  };
  work_centers: InsightWorkCenter[];
  employees: InsightEmployee[];
  employee_data_share: number | null;
  delivery_risk: InsightRisk[];
  receivables: { total: number; aging: { bucket: string; amount: number }[]; top: { name: string; amount: number }[] };
  recommendations: InsightTip[];
}
