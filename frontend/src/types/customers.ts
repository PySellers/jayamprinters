export interface Customer {
  id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  gstin?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface CustomerInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  gstin?: string | null;
  notes?: string | null;
}
