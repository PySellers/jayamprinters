export interface QuantitySlab {
  id: number;
  category_id: number;
  min_quantity: number;
  max_quantity: number | null;
  label: string | null;
  display_order: number;
  /** Each band prices only its own units ("1st 1000 + each additional"). */
  is_incremental?: boolean;
}

export interface QuantitySlabInput {
  category_id: number;
  min_quantity: number;
  max_quantity?: number | null;
  label?: string | null;
  display_order?: number;
  is_incremental?: boolean;
}
