export type ChargeType = 'flat' | 'per_unit' | 'per_sqft' | 'percentage';

export interface ExtraCharge {
  id: number;
  category_id: number | null;
  name: string;
  charge_type: ChargeType;
  amount: number;
  is_active: boolean;
}

export interface ExtraChargeInput {
  category_id?: number | null;
  name: string;
  charge_type: ChargeType;
  amount: number;
  is_active?: boolean;
}
