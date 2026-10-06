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
