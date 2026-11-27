import type { InvoiceStatus, PaymentMethod } from './common';

import type { BreakdownRow } from './quotations';

export interface InvoiceItem {
  id: number;
  product_id?: number | null;
  /** The row as the bill prints it (item with its chosen options; a bill book reads "Bill Book - 1/4 (...)"). */
  description?: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  spec_notes?: string | null;
  hsn_code?: string | null;
  tax_rate?: number;
  tax_amount?: number;
  discount_amount?: number;
  /** Edited on the invoice */
  particulars?: string | null;
  option_texts?: Record<string, string> | null;
  cgst_rate?: number | null;
  sgst_rate?: number | null;
  cgst_amount?: number | null;
  sgst_amount?: number | null;
  price_breakdown?: BreakdownRow[] | null;
}

export interface Payment {
  id: number;
  amount: number;
  method: PaymentMethod;
  reference_number?: string | null;
  upi_id?: string | null;
  bank_details?: string | null;
  is_advance?: boolean;
  has_proof?: boolean;
  notes?: string | null;
  payment_date: string;
  created_at: string;
}

export interface Invoice {
  id: number;
  invoice_number: string;
  quotation_id: number;
  customer_id: number;
  tax_id?: number | null;
  subtotal: number;
  discount_type?: 'percent' | 'amount' | null;
  discount_value?: number;
  discount_amount?: number;
  adjustment_amount?: number;
  tax_amount: number;
  grand_total: number;
  amount_paid: number;
  status: InvoiceStatus;
  with_gst: boolean;
  invoice_date: string;
  notes?: string | null;
  pay_by_date?: string | null;
  bill_to_name?: string | null;
  bill_to_address?: string | null;
  bill_to_gstin?: string | null;
  bill_to_phone?: string | null;
  last_edited_at?: string | null;
  last_edited_by?: string | null;
  created_at: string;
  items: InvoiceItem[];
  payments: Payment[];
}

export interface PaymentInput {
  amount: number;
  method: PaymentMethod;
  reference_number?: string | null;
  upi_id?: string | null;
  bank_details?: string | null;
  is_advance?: boolean;
  notes?: string | null;
}

export interface DueRow {
  invoice_id: number;
  invoice_number: string;
  bill_no?: number | null;
  customer_id: number;
  customer_name: string;
  phone?: string | null;
  grand_total: number;
  paid: number;
  balance: number;
  pay_by_date: string;
  days_left: number;
  state: 'overdue' | 'today' | 'upcoming';
}

/** One row of the Edit Invoice window. */
export interface InvoiceEditLine {
  id?: number | null;
  particulars: string;
  hsn_code?: string | null;
  quantity: number;
  unit_price: number;
  cgst_rate: number;
  sgst_rate: number;
}

export interface InvoiceEditRequest {
  bill_to_name?: string | null;
  bill_to_address?: string | null;
  bill_to_gstin?: string | null;
  bill_to_phone?: string | null;
  invoice_date?: string | null;
  notes?: string | null;
  final_amount?: number | null;
  items: InvoiceEditLine[];
}

export interface InvoiceEditLineOut {
  id?: number | null;
  particulars: string;
  hsn_code?: string | null;
  quantity: number;
  unit_price: number;
  amount: number;
  discount_amount: number;
  cgst_rate: number;
  sgst_rate: number;
  cgst_amount: number;
  sgst_amount: number;
  total: number;
}

export interface InvoiceEditPreview {
  lines: InvoiceEditLineOut[];
  subtotal: number;
  discount_amount: number;
  taxable_amount: number;
  tax_amount: number;
  computed_total: number;
  adjustment_amount: number;
  grand_total: number;
  amount_paid: number;
  balance: number;
}

export interface InvoiceEditForm {
  invoice_id: number;
  with_gst: boolean;
  bill_to_name: string;
  bill_to_address: string;
  bill_to_gstin: string;
  bill_to_phone: string;
  invoice_date: string;
  notes?: string | null;
  final_amount?: number | null;
  amount_paid: number;
  items: InvoiceEditLine[];
  history: { edited_at?: string | null; edited_by?: string | null; summary?: string | null }[];
}
