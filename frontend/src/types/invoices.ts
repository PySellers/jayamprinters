import type { InvoiceStatus, PaymentMethod } from './common';

import type { BreakdownRow } from './quotations';

export interface InvoiceItem {
  id: number;
  product_id: number;
  quantity: number;
  unit_price: number;
  total_price: number;
  spec_notes?: string | null;
  hsn_code?: string | null;
  tax_rate?: number;
  tax_amount?: number;
  discount_amount?: number;
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
  tax_amount: number;
  grand_total: number;
  amount_paid: number;
  status: InvoiceStatus;
  with_gst: boolean;
  invoice_date: string;
  notes?: string | null;
  pay_by_date?: string | null;
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