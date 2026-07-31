import type { InvoiceStatus, OrderType, PaymentMethod } from './common';

export interface InvoiceItem {
  id: number;
  product_id: number;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface Payment {
  id: number;
  amount: number;
  method: PaymentMethod;
  reference_number?: string | null;
  notes?: string | null;
  payment_date: string;
  created_at: string;
}

export interface Invoice {
  id: number;
  invoice_number: string;
  quotation_id: number;
  customer_id: number;
  order_type: OrderType;
  tax_id?: number | null;
  subtotal: number;
  tax_amount: number;
  grand_total: number;
  amount_paid: number;
  status: InvoiceStatus;
  invoice_date: string;
  notes?: string | null;
  created_at: string;
  items: InvoiceItem[];
  payments: Payment[];
}

export interface PaymentInput {
  amount: number;
  method: PaymentMethod;
  reference_number?: string | null;
  notes?: string | null;
}
