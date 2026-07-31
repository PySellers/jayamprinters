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

export interface Purchase {
  id: number;
  purchase_number: string;
  vendor_id: number;
  purchase_date: string;
  subtotal: number;
  tax_amount: number;
  grand_total: number;
  notes?: string | null;
  created_at: string;
  items: PurchaseItem[];
}

export interface PurchaseInput {
  vendor_id: number;
  purchase_date?: string | null;
  tax_amount: number;
  notes?: string | null;
  items: PurchaseItemInput[];
}
