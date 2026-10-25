export interface HsnCode {
  id: number;
  code: string;
  description?: string | null;
  /** Total GST %, split equally into CGST + SGST. */
  gst_rate: number;
  is_active: boolean;
}

export type HsnInput = Omit<HsnCode, 'id'>;

export interface Company {
  name: string;
  tagline?: string | null;
  gstin?: string | null;
  state_code?: string | null;
  address?: string | null;
  phones?: string | null;
  landline?: string | null;
  email?: string | null;
  bank_name?: string | null;
  bank_branch?: string | null;
  bank_account_name?: string | null;
  bank_account_no?: string | null;
  bank_ifsc?: string | null;
  show_bank_on_invoice: boolean;
  next_gst_invoice_no: number;
  next_cash_bill_no: number;
  next_challan_no: number;
}
