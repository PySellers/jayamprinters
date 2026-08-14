import type { PaymentMethod, PurchaseStatus } from './common';

export interface Vendor {
  id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  gstin?: string | null;
  is_active: boolean;
}

export interface VendorInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  gstin?: string | null;
}

export interface InventoryItem {
  id: number;
  name: string;
  unit: string;
  current_qty: number;
  reorder_threshold: number;
  notes?: string | null;
  low_stock: boolean;
}

export interface InventoryItemInput {
  name: string;
  unit: string;
  current_qty: number;
  reorder_threshold: number;
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
  amount: number;
  method?: PaymentMethod | null;
  reference_number?: string | null;
  notes?: string | null;
  payment_date: string;
  created_at: string;
}

export interface PurchasePaymentInput {
  amount: number;
  method?: PaymentMethod | null;
  reference_number?: string | null;
  notes?: string | null;
}

export interface Purchase {
  id: number;
  purchase_number: string;
  vendor_id: number;
  purchase_date: string;
  total_amount: number;
  paid_amount: number;
  status: PurchaseStatus;
  notes?: string | null;
  created_at: string;
  items: PurchaseItem[];
  payments: PurchasePayment[];
}

export interface PurchaseInput {
  vendor_id: number;
  purchase_date?: string | null;
  notes?: string | null;
  items: PurchaseItemInput[];
}
