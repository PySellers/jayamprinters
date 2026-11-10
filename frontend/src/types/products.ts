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
  /** Printing charge on top of paper cost: 'block' (rate per block of copies), 'per_copy' or 'slab' (a table of bands). */
  print_charge_mode?: 'block' | 'per_copy' | 'slab' | null;
  print_block_size?: number | null;
  print_block_rate?: number | null;
  print_per_copy_rate?: number | null;
  print_per_layer?: boolean;
  /** Extra charges are a required choice per group (None / an option / Custom). */
  extras_required?: boolean;
}

/** One band of a service's printing-charge table. */
export interface PrintChargeBand {
  id?: number;
  min_quantity: number;
  max_quantity: number | null;
  amount: number;
  per_block: boolean;
  block_size: number | null;
}

export interface Product {
  id: number;
  name: string;
  category_id?: number | null;
  description?: string | null;
  pricing_type: ProductPricingType;
  fixed_price?: number | null;
  hsn_id?: number | null;
  /** Smallest quantity that can be ordered. */
  min_quantity?: number | null;
  /** Groups the items of a service in the order form (e.g. Rubber Stamp: Polymer Stamp series, Printer / Dater). */
  sub_category?: string | null;
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
  min_quantity?: number | null;
  sub_category?: string | null;
  is_active?: boolean;
}
