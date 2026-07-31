import type { OrderType, QuotationStatus } from './common';

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
  spec_notes?: string | null;
  selected_options: SelectedOption[];
}

export interface Quotation {
  id: number;
  quotation_number: string;
  customer_id: number;
  status: QuotationStatus;
  order_type: OrderType;
  tax_id?: number | null;
  total_amount: number;
  tax_amount: number;
  grand_total: number;
  notes?: string | null;
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
}

export interface QuotationCreateInput {
  customer_id: number;
  order_type: OrderType;
  tax_id?: number | null;
  notes?: string | null;
  delivery_date?: string | null;
  delivery_time?: string | null;
  items: QuotationItemInput[];
}
