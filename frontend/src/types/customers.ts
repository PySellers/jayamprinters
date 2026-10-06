export interface Customer {
  id: number;
  name: string;
  billing_person_name?: string | null;
  phone?: string | null;
  whatsapp_number?: string | null;
  email?: string | null;
  address?: string | null;
  gstin?: string | null;
  reason?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface CustomerInput {
  name: string;
  billing_person_name?: string | null;
  phone?: string | null;
  whatsapp_number?: string | null;
  email?: string | null;
  address?: string | null;
  gstin?: string | null;
  reason?: string | null;
  notes?: string | null;
}