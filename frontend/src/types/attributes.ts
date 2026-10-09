export interface AttributeOption {
  id: number;
  attribute_id: number;
  value: string;
  extra_price: number;
  display_order: number;
  is_active: boolean;
}

export interface AttributeOptionInput {
  value: string;
  extra_price?: number;
  display_order?: number;
  is_active?: boolean;
}

export interface Attribute {
  id: number;
  category_id: number;
  name: string;
  is_required: boolean;
  display_order: number;
  is_active: boolean;
  /** false = descriptive / surcharge-only choice, not part of the price-matrix key. */
  in_price_matrix?: boolean;
  options: AttributeOption[];
}

export interface AttributeInput {
  category_id: number;
  name: string;
  is_required?: boolean;
  display_order?: number;
  is_active?: boolean;
}
