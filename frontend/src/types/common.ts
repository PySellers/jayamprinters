export interface MasterEntity {
  id: number;
  name: string;
  is_active: boolean;
}

export interface PricedMasterEntity extends MasterEntity {
  extra_price: number;
}

export type QuotationStatus = 'draft' | 'sent' | 'approved' | 'rejected' | 'converted';

export type OrderType = 'offline' | 'online';

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

export type PaymentMethod = 'cash' | 'upi' | 'card' | 'credit' | 'bank_transfer' | 'cheque';

export type ChequeStatus = 'pending' | 'deposited' | 'cleared' | 'bounced';

export type DocumentType = 'quotation' | 'estimate';

export type DeliveryChallanBillType = 'cash_bill' | 'tax_gst_bill';
