export type OutsourceStatus = 'sent' | 'in_progress' | 'received' | 'delivered' | 'cancelled';

export interface OutsourcePayment {
  id: number;
  amount: number;
  method?: string | null;
  reference_number?: string | null;
  upi_id?: string | null;
  bank_details?: string | null;
  notes?: string | null;
  payment_date?: string | null;
  has_proof?: boolean;
}

export interface OutsourceJob {
  id: number;
  job_number: string;
  vendor_id?: number | null;
  vendor_name?: string | null;
  customer_id?: number | null;
  job_card_id?: number | null;
  service: string;
  description?: string | null;
  size?: string | null;
  quantity: number;
  sent_date?: string | null;
  expected_date?: string | null;
  received_date?: string | null;
  status: OutsourceStatus;
  cost_amount: number;
  customer_price: number;
  amount_paid: number;
  notes?: string | null;
  margin: number;
  balance_to_pay: number;
  payments?: OutsourcePayment[];
}

export type OutsourceInput = Partial<Omit<OutsourceJob, 'id' | 'job_number' | 'amount_paid' | 'margin' | 'balance_to_pay' | 'payments'>> & { service: string };
