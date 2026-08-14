import api from '../utils/api';
import type { Vendor, VendorInput } from '../types/purchases';

export const vendorsApi = {
  list: async (): Promise<Vendor[]> => (await api.get('/vendors/')).data,
  get: async (id: number): Promise<Vendor> => (await api.get(`/vendors/${id}`)).data,
  create: async (data: VendorInput): Promise<Vendor> => (await api.post('/vendors/', data)).data,
  update: async (id: number, data: Partial<VendorInput & { is_active: boolean }>): Promise<Vendor> =>
    (await api.put(`/vendors/${id}`, data)).data,
  remove: async (id: number): Promise<void> => {
    await api.delete(`/vendors/${id}`);
  },
};
