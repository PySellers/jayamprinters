export interface MasterEntity {
  id: number;
  name: string;
  is_active: boolean;
}

export interface PricedMasterEntity extends MasterEntity {
  extra_price: number;
}

export type QuotationStatus = 'draft' | 'sent' | 'approved' | 'rejected' | 'converted';

export type JobCardStatus =
  | 'pending'
  | 'design'
  | 'approval'
  | 'printing'
  | 'binding'
  | 'packing'
  | 'delivered';

export type JobCardPriority = 'low' | 'medium' | 'high' | 'urgent';

export type InvoiceStatus = 'unpaid' | 'partially_paid' | 'paid';

export type PaymentMethod = 'cash' | 'upi' | 'card' | 'credit' | 'bank_transfer';

export type UserRole = 'admin' | 'counter' | 'production' | 'accounts';

export type CashTxnType = 'receipt' | 'payment' | 'bank_deposit';

export type ChequeDirection = 'issued' | 'deposited';

export type ChequeStatus = 'pending' | 'cleared' | 'bounced';

export type PurchaseStatus = 'unpaid' | 'partially_paid' | 'paid';
