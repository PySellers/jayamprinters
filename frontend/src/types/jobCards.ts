import type { JobCardPriority, JobCardStatus } from './common';

export interface JobCard {
  id: number;
  job_number: string;
  quotation_item_id?: number | null;
  customer_id: number;
  product_id: number;
  machine_id?: number | null;
  designer_id?: number | null;
  operator_id?: number | null;
  delivery_date?: string | null;
  priority: JobCardPriority;
  status: JobCardStatus;
  notes?: string | null;
  created_at: string;
  delivered_at?: string | null;
  // progress through the production workflow (worked out by the server)
  steps_total: number;
  steps_done: number;
  current_step?: string | null;
  current_step_status?: string | null;
  current_work_center?: string | null;
  current_assignee?: string | null;
  overdue: boolean;
  quantity?: number | null;
  // design proofs: how many, how many approved, and the one to watch
  proofs_total?: number;
  proofs_approved?: number;
  proof_status?: ProofStatus | null;
  proof_text?: string | null;
  proof_overdue?: boolean;
}

export type ProofStatus = 'scheduled' | 'sent' | 'approved' | 'changes';

export interface JobProof {
  id: number;
  job_card_id: number;
  number: number;
  label: string;
  due_date?: string | null;
  due_time?: string | null;
  status: ProofStatus;
  status_label: string;
  handled_by?: number | null;
  handled_by_name?: string | null;
  notes?: string | null;
  sent_at?: string | null;
  decided_at?: string | null;
  overdue: boolean;
}

export interface JobCardDetail {
  job_card_id: number;
  job_number: string;
  status: JobCardStatus;
  status_label: string;
  stages: { key: JobCardStatus; label: string }[];
  priority: JobCardPriority;
  urgent: boolean;
  created_at: string;
  delivered_at?: string | null;
  delivery_date?: string | null;
  delivery_time?: string | null;
  overdue: boolean;
  invoice_number?: string | null;
  bill_no?: number | null;
  invoice_date?: string | null;
  order_number?: string | null;
  dc_number?: number | null;
  customer: { name: string; billing_person?: string | null; phone?: string | null; whatsapp?: string | null; address?: string | null };
  job: { service?: string | null; item: string; quantity?: number | null; sets?: number | null; area_sqft?: number | null };
  specs: { label: string; value: string }[];
  copies: { copy: number; name: string; paper: string; gsm: string; size: string; colour: string }[];
  extras: { group: string; name: string; full_name: string; amount?: number; custom?: boolean }[];
  notes: string[];
  proofs: JobProof[];
  steps: {
    id: number; position: number; name: string; kind: string; status: string; work_center_name?: string | null;
    assigned_to_name?: string | null; completed_at?: string | null;
  }[];
  progress: { done: number; total: number };
  now_with: { step?: string | null; work_center?: string | null; person?: string | null; status?: string | null };
  with_price: boolean;
  price?: { rate: number; amount: number; discount: number; tax: number; breakdown: import('./quotations').BreakdownRow[]; with_gst: boolean };
}

export interface JobCardCreateInput {
  customer_id: number;
  product_id: number;
  quotation_item_id?: number | null;
  machine_id?: number | null;
  designer_id?: number | null;
  operator_id?: number | null;
  delivery_date?: string | null;
  priority?: JobCardPriority;
  notes?: string | null;
}

export interface JobCardUpdateInput {
  machine_id?: number | null;
  designer_id?: number | null;
  operator_id?: number | null;
  delivery_date?: string | null;
  priority?: JobCardPriority;
  notes?: string | null;
}

// ---- Paper job card ("sheet") -------------------------------------------------
export interface SheetPaperRow {
  range: string;
  kgs: string;
  colour: string;
  qty: string;
  printing: string;
}

export type SheetPaymentKey =
  | 'first' | 'rate' | 'advance' | 'balance1' | 'ap_advance' | 'balance2'
  | 'dtp' | 'proof' | 'printing' | 'binding' | 'packing' | 'delivery';

export interface JobCardSheetData {
  party_name: string;
  mobile: string;
  job_name: string;
  size: string;
  type_of_printing: string[];
  proof1_date: string;
  proof1_time: string;
  proof2_date: string;
  proof2_time: string;
  delivery_date: string;
  delivery_time: string;
  paper: SheetPaperRow[];
  more_proofs?: { date: string; time: string }[];
  cutting_size: string;
  printing_colours: string[];
  margins: string[];
  serial_from_to: string;
  book_from_to: string;
  payment: Record<SheetPaymentKey, string>;
  remarks: string;
  job_position: string[];
}

export interface JobCardSheet {
  job_card_id: number;
  job_number: string;
  invoice_number?: string | null;
  invoice_date?: string | null;
  invoice_time?: string | null;
  dc_number?: number | null;
  sheet: JobCardSheetData;
  /** Which parts of the form belong to this job's service. */
  profile: SheetProfile;
  price_lines: { label: string; detail: string; amount: number }[];
}

export interface SheetProfile {
  kind: string;
  type_options: string[];
  show_colours: boolean;
  show_margin: boolean;
  show_numbering: boolean;
  show_cutting: boolean;
  show_proofs: boolean;
  copy_rows: number;
  paper_labels: { range: string; kgs: string; colour: string; qty: string; printing: string };
  position_options: string[];
  payment_keys: SheetPaymentKey[];
}

export interface JobCardComment {
  id: number;
  job_card_id: number;
  text: string;
  created_by?: number | null;
  created_at: string;
}

export interface JobCardCommentInput {
  text: string;
  created_by?: number | null;
}