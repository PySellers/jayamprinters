export type ProductPricingType = 'matrix' | 'fixed' | 'per_area';

export interface ProductCategory {
  id: number;
  name: string;
  is_active: boolean;
  /** Set when the service has a dedicated step-by-step order screen (e.g. 'bill_book'). */
  guided_flow?: string | null;
  /** Smallest amount billed for one line of this service. */
  min_charge?: number | null;
  /** Default HSN / SAC code of the service (sets the GST rate). */
  hsn_id?: number | null;
  /** Printing charge on top of paper cost: 'block' (rate per block of copies) or 'per_copy'. */
  print_charge_mode?: 'block' | 'per_copy' | null;
  print_block_size?: number | null;
  print_block_rate?: number | null;
  print_per_copy_rate?: number | null;
  print_per_layer?: boolean;
}

export interface Product {
  id: number;
  name: string;
  category_id?: number | null;
  description?: string | null;
  pricing_type: ProductPricingType;
  fixed_price?: number | null;
  hsn_id?: number | null;
  is_active: boolean;
  created_at: string;
}

export interface ProductInput {
  name: string;
  category_id?: number | null;
  description?: string | null;
  pricing_type?: ProductPricingType;
  fixed_price?: number | null;
  hsn_id?: number | null;
  is_active?: boolean;
}
