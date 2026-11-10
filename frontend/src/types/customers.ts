export interface Customer {
  id: number;
  name: string;
  billing_person_name?: string | null;
  phone?: string | null;
  whatsapp_number?: string | null;
  email?: string | null;
  address?: string | null;
  gstin?: string | null;
  reason?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface BillingDefaults {
  /** Next free walk-in placeholder, e.g. 'Person 15'. */
  next_person_name: string;
  recent_customers: Customer[];
}

export interface CustomerInput {
  name: string;
  billing_person_name?: string | null;
  phone?: string | null;
  whatsapp_number?: string | null;
  email?: string | null;
  address?: string | null;
  gstin?: string | null;
  reason?: string | null;
  notes?: string | null;
}

export interface CustomerOrderRow {
  invoice_id: number;
  invoice_number: string;
  bill_no?: number | null;
  date?: string | null;
  name: string;
  quantity: number;
  lines: number;
  amount: number;
  discount: number;
  paid: number;
  balance: number;
  status?: string | null;
  with_gst: boolean;
}

/** A customer's earlier orders (one line each) and a short summary, shown under the discount box. */
export interface CustomerOrders {
  customer_id: number;
  orders: number;
  orders_last_180_days: number;
  total_billed: number;
  average_order: number;
  discount_given: number;
  balance_due: number;
  tag: string;
  rows: CustomerOrderRow[];
}
