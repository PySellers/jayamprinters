export interface QuantitySlab {
  id: number;
  category_id: number;
  min_quantity: number;
  max_quantity: number | null;
  label: string | null;
  display_order: number;
}

export interface QuantitySlabInput {
  category_id: number;
  min_quantity: number;
  max_quantity?: number | null;
  label?: string | null;
  display_order?: number;
}
