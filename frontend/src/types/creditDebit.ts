export type CreditDebitKind = 'credit' | 'debit';

export interface CreditDebitEntry {
  id: number;
  kind: CreditDebitKind;
  name: string;
  amount: number;
  note?: string | null;
  entry_date: string;
  created_by?: string | null;
  created_at?: string | null;
}

export interface CreditDebitInput {
  kind: CreditDebitKind;
  name: string;
  amount: number;
  note?: string | null;
  entry_date?: string | null;
}

export interface CreditDebitUpdateInput {
  name: string;
  amount: number;
  note?: string | null;
  entry_date: string;
}

export interface CreditDebitFilters {
  name?: string;
  date_from?: string;
  date_to?: string;
}

export interface NameBalance {
  name: string;
  credit: number;
  debit: number;
  net: number;
}

export interface CreditDebitSummary {
  credit_total: number;
  debit_total: number;
  net: number;
  credit_count: number;
  debit_count: number;
  by_name: NameBalance[];
}
