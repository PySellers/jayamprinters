import type { ChequeStatus } from './common';

export interface CashSummary {
  cash_in_hand: number;
  cash_in_bank: number;
  cash_received: number;
  cash_paid_out: number;
  bank_received: number;
  bank_paid_out: number;
}

export interface ChequeEntry {
  id: number;
  direction: 'received' | 'issued';
  amount: number;
  cheque_number?: string | null;
  cheque_date?: string | null;
  issued_branch?: string | null;
  cheque_status?: ChequeStatus | null;
  cheque_deposit_date?: string | null;
  reference_number?: string | null;
  payment_date: string;
}
