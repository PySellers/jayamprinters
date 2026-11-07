export type StepStatus = 'waiting' | 'ready' | 'in_progress' | 'on_hold' | 'done' | 'skipped';
export type StepKind = 'internal' | 'outsource' | 'purchase';
export type WorkStage = 'design' | 'approval' | 'printing' | 'binding' | 'packing';

export interface WorkCenter {
  id: number;
  name: string;
  description?: string | null;
  color?: string | null;
  display_order: number;
  is_active: boolean;
  members: { id: number; name: string }[];
  open_steps: number;
}

export interface WorkCenterInput {
  name: string;
  description?: string | null;
  color?: string | null;
  display_order?: number;
  is_active?: boolean;
}

export interface Staff {
  id: number;
  name: string;
  role: string;
  work_center_ids: number[];
}

export interface TemplateStep {
  id?: number;
  position?: number;
  name: string;
  kind: StepKind;
  stage: WorkStage;
  work_center_id?: number | null;
  work_center_name?: string | null;
}

export interface WorkflowTemplate {
  category_id: number | null;
  category_name: string;
  is_custom: boolean;
  steps: TemplateStep[];
}

export interface JobStep {
  id: number;
  job_card_id: number;
  position: number;
  name: string;
  kind: StepKind;
  stage: WorkStage;
  status: StepStatus;
  work_center_id?: number | null;
  work_center_name?: string | null;
  work_center_color?: string | null;
  assigned_to?: number | null;
  assigned_to_name?: string | null;
  ready_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  started_by_name?: string | null;
  completed_by_name?: string | null;
  minutes_taken?: number | null;
  minutes_waiting?: number | null;
  due_date?: string | null;
  hold_reason?: string | null;
  notes?: string | null;
  outsource_job_id?: number | null;
  outsource_job_number?: string | null;
  outsource_vendor?: string | null;
  outsource_expected_date?: string | null;
  can_act: boolean;
}

export interface WorkCard extends JobStep {
  job_number: string;
  customer_name?: string | null;
  product_name?: string | null;
  quantity?: number | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  delivery_date?: string | null;
  overdue: boolean;
  steps_total: number;
  steps_done: number;
  job_notes?: string | null;
}

export interface MyWork {
  mine: WorkCard[];
  queue: WorkCard[];
  work_centers: string[];
  count: number;
}

export interface BoardColumn {
  id: number | null;
  name: string;
  color?: string | null;
  cards: WorkCard[];
}

export interface JobEvent {
  id: number;
  step_id?: number | null;
  step_name?: string | null;
  user_name?: string | null;
  action: string;
  detail?: string | null;
  created_at?: string | null;
}

export interface ProductionSummary {
  open_jobs: number;
  overdue_jobs: number;
  due_today: number;
  urgent_jobs: number;
  delivered_today: number;
  on_hold_steps: number;
  by_work_center: { id: number; name: string; color?: string | null; ready: number; in_progress: number; on_hold: number; done_today: number; avg_minutes: number | null }[];
  by_employee: { user_id: number; name: string | null; in_progress: number; assigned_waiting: number; on_hold: number; done_today: number; done_week: number }[];
  waiting_longest: { job_card_id: number; job_number: string; step_name: string; work_center_name?: string | null; waiting_minutes: number }[];
  outside_work: { id: number; job_number: string; vendor?: string | null; service: string; sent_date?: string | null; expected_date?: string | null; late: boolean; job_card_id?: number | null }[];
  on_hold: { job_card_id: number; job_number: string; step_name: string; reason?: string | null; work_center_name?: string | null }[];
  overdue: { job_card_id: number; job_number: string; customer_name?: string | null; product_name?: string | null; delivery_date?: string | null; current_step?: string | null; current_work_center?: string | null; current_assignee?: string | null }[];
  trend: { date: string; steps_done: number; orders_delivered: number }[];
}

export interface SendOutInput {
  vendor_id?: number | null;
  vendor_name?: string | null;
  cost_amount: number;
  customer_price: number;
  expected_date?: string | null;
  description?: string | null;
}
