import type { QuotationStatus } from './common';

export interface SelectedOption {
  attribute_id: number;
  attribute_option_id: number;
}

export interface QuotationItem {
  id: number;
  product_id: number;
  quantity: number;
  area_sqft?: number | null;
  unit_price: number;
  total_price: number;
  hsn_code?: string | null;
  tax_rate?: number;
  tax_amount?: number;
  print_charge?: number;
  selected_options: SelectedOption[];
}

export interface Quotation {
  id: number;
  quotation_number: string;
  customer_id: number;
  status: QuotationStatus;
  tax_id?: number | null;
  total_amount: number;
  tax_amount: number;
  grand_total: number;
  notes?: string | null;
  with_gst?: boolean;
  is_order?: boolean;
  proof1_date?: string | null;
  proof1_time?: string | null;
  proof2_date?: string | null;
  proof2_time?: string | null;
  delivery_date?: string | null;
  delivery_time?: string | null;
  created_at: string;
  items: QuotationItem[];
}

export interface QuotationItemInput {
  product_id: number;
  quantity: number;
  area_sqft?: number | null;
  selected_options?: SelectedOption[];
  extra_charge_ids?: number[];
  spec_notes?: string | null;
  /** Number of copies (sets) of the document; per-set charges such as binding multiply by it. */
  sets?: number;
  /** GSM option of the 2nd, 3rd... copy of a bill-book set (blank = same as the top copy). */
  layer_gsm_option_ids?: number[];
}

export interface QuotationCreateInput {
  customer_id: number;
  tax_id?: number | null;
  notes?: string | null;
  with_gst?: boolean;
  is_order?: boolean;
  proof1_date?: string | null;
  proof1_time?: string | null;
  proof2_date?: string | null;
  proof2_time?: string | null;
  delivery_date?: string | null;
  delivery_time?: string | null;
  estimated_delivery?: string | null;
  items: QuotationItemInput[];
}

export interface QuotationPreviewRequest {
  tax_id?: number | null;
  with_gst?: boolean;
  items: QuotationItemInput[];
}

export interface QuotationPreviewItem {
  unit_price: number;
  total_price: number;
  priceable: boolean;
  paper_total?: number;
  print_charge?: number;
  hsn_code?: string | null;
  tax_rate?: number;
  tax_amount?: number;
}

export interface TaxBreakdownRow {
  hsn_code?: string | null;
  rate: number;
  taxable: number;
  tax: number;
}

export interface QuotationPreview {
  items: QuotationPreviewItem[];
  subtotal: number;
  tax_amount: number;
  grand_total: number;
  tax_breakdown?: TaxBreakdownRow[];
}