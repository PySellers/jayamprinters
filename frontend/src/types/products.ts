export type ProductPricingType = 'matrix' | 'fixed' | 'per_area';

export interface ProductCategory {
  id: number;
  name: string;
  is_active: boolean;
  /** Set when the service has a dedicated step-by-step order screen (e.g. 'bill_book'). */
  guided_flow?: string | null;
}

export interface Product {
  id: number;
  name: string;
  category_id?: number | null;
  description?: string | null;
  pricing_type: ProductPricingType;
  fixed_price?: number | null;
  is_active: boolean;
  created_at: string;
}

export interface ProductInput {
  name: string;
  category_id?: number | null;
  description?: string | null;
  pricing_type?: ProductPricingType;
  fixed_price?: number | null;
  is_active?: boolean;
}
