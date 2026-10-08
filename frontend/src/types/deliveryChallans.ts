export interface ChallanItem {
  particulars: string;
  qty: string;
}

export interface DeliveryChallan {
  // id is null for an unsaved draft; dc_number is then only a preview of the next S.No.
  id: number | null;
  financial_year: number;
  financial_year_label: string;
  dc_number: number;
  job_card_id: number | null;
  customer_id: number;
  challan_date: string;
  to_text: string;
  items: ChallanItem[];
}

export interface DeliveryChallanInput {
  challan_date: string;
  to_text: string;
  items: ChallanItem[];
}