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
  created_at: string;
  items: QuotationItem[];
}

export interface QuotationItemInput {
  product_id: number;
  quantity: number;
  area_sqft?: number | null;
  selected_options?: SelectedOption[];
  extra_charge_ids?: number[];
}

export interface QuotationCreateInput {
  customer_id: number;
  tax_id?: number | null;
  notes?: string | null;
  items: QuotationItemInput[];
}
