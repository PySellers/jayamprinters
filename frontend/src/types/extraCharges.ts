export type ChargeType = 'flat' | 'per_unit' | 'per_sqft' | 'percentage';

export interface ExtraCharge {
  id: number;
  category_id: number | null;
  name: string;
  charge_type: ChargeType;
  amount: number;
  is_active: boolean;
  /** Charges sharing a group_name are single-choice (pick at most one). */
  group_name?: string | null;
  /** Only applies when this attribute option is selected. */
  requires_option_id?: number | null;
}

export interface ExtraChargeInput {
  category_id?: number | null;
  name: string;
  charge_type: ChargeType;
  amount: number;
  is_active?: boolean;
  group_name?: string | null;
  requires_option_id?: number | null;
}
