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