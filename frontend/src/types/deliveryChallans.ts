import type { DeliveryChallanBillType } from './common';

export interface DeliveryChallan {
  id: number;
  challan_number: string;
  invoice_id: number;
  bill_type: DeliveryChallanBillType;
  vehicle_number?: string | null;
  transporter_name?: string | null;
  delivery_date: string;
  notes?: string | null;
  created_at: string;
}

export interface DeliveryChallanInput {
  invoice_id: number;
  bill_type: DeliveryChallanBillType;
  vehicle_number?: string | null;
  transporter_name?: string | null;
  delivery_date?: string | null;
  notes?: string | null;
}
