import type { ChequeStatus, InvoiceStatus, PaymentMethod } from './common';

export interface Vendor {
  id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  gstin?: string | null;
  notes?: string | null;
  is_active: boolean;
  created_at: string;
}

export type VendorInput = Omit<Vendor, 'id' | 'created_at'>;

export interface InventoryItem {
  id: number;
  name: string;
  unit: string;
  current_stock: number;
  reorder_level: number;
  is_active: boolean;
}

export type InventoryItemInput = Omit<InventoryItem, 'id' | 'current_stock'>;

export type StockMovementType = 'purchase_in' | 'consumption' | 'adjustment';

export interface StockMovement {
  id: number;
  inventory_item_id: number;
  movement_type: StockMovementType;
  quantity: number;
  reference?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface StockAdjustmentInput {
  quantity: number;
  notes?: string | null;
}

export interface PurchaseItem {
  id: number;
  inventory_item_id: number;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface PurchaseItemInput {
  inventory_item_id: number;
  quantity: number;
  unit_price: number;
}

export interface PurchasePayment {
  id: number;
  purchase_id: number;
  amount: number;
  method: PaymentMethod;
  reference_number?: string | null;
  notes?: string | null;
  payment_date: string;
  created_at: string;
  cheque_number?: string | null;
  cheque_date?: string | null;
  issued_branch?: string | null;
  cheque_status?: ChequeStatus | null;
  cheque_deposit_date?: string | null;
}

export interface PurchasePaymentInput {
  amount: number;
  method: PaymentMethod;
  reference_number?: string | null;
  notes?: string | null;
  cheque_number?: string | null;
  cheque_date?: string | null;
  issued_branch?: string | null;
  cheque_status?: ChequeStatus | null;
  cheque_deposit_date?: string | null;
}

export interface Purchase {
  id: number;
  purchase_number: string;
  vendor_id: number;
  purchase_date: string;
  subtotal: number;
  tax_amount: number;
  grand_total: number;
  amount_paid: number;
  status: InvoiceStatus;
  notes?: string | null;
  created_at: string;
  items: PurchaseItem[];
  payments: PurchasePayment[];
}

export interface PurchaseInput {
  vendor_id: number;
  purchase_date?: string | null;
  tax_amount: number;
  notes?: string | null;
  items: PurchaseItemInput[];
}
