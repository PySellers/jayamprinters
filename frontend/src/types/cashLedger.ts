import type { CashTxnType, ChequeDirection, ChequeStatus } from './common';

export interface CashTransaction {
  id: number;
  txn_type: CashTxnType;
  amount: number;
  note?: string | null;
  created_by?: string | null;
  created_at: string;
}

export interface CashTransactionInput {
  txn_type: CashTxnType;
  amount: number;
  note?: string | null;
  created_by?: string | null;
}

export interface CashSummary {
  cash_in_hand: number;
  cash_in_bank: number;
  transactions: CashTransaction[];
}

export interface ChequeTransaction {
  id: number;
  direction: ChequeDirection;
  cheque_no: string;
  cheque_date?: string | null;
  bank_branch?: string | null;
  deposit_date?: string | null;
  amount: number;
  status: ChequeStatus;
  party_name?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface ChequeTransactionInput {
  direction: ChequeDirection;
  cheque_no: string;
  cheque_date?: string | null;
  bank_branch?: string | null;
  deposit_date?: string | null;
  amount: number;
  party_name?: string | null;
  notes?: string | null;
}
