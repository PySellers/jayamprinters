import type { SelectedOption } from './quotations';

export interface PriceMatrixCellOption extends SelectedOption {
  id: number;
}

export interface PriceMatrixCell {
  id: number;
  product_id: number;
  quantity_slab_id: number;
  unit_price: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  options: PriceMatrixCellOption[];
}

export interface PriceMatrixCellInput {
  product_id: number;
  quantity_slab_id: number;
  unit_price: number;
  is_active?: boolean;
  options: SelectedOption[];
}
