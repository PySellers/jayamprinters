import api from '../utils/api';
import type { ExtraCharge, ExtraChargeInput } from '../types/extraCharges';

export const extraChargesApi = {
  list: async (categoryId?: number | null): Promise<ExtraCharge[]> =>
    (await api.get('/extra-charges/', { params: categoryId ? { category_id: categoryId } : {} })).data,
  get: async (id: number): Promise<ExtraCharge> => (await api.get(`/extra-charges/${id}`)).data,
  create: async (data: ExtraChargeInput): Promise<ExtraCharge> => (await api.post('/extra-charges/', data)).data,
  update: async (id: number, data: Partial<ExtraChargeInput>): Promise<ExtraCharge> =>
    (await api.put(`/extra-charges/${id}`, data)).data,
  remove: async (id: number): Promise<void> => {
    await api.delete(`/extra-charges/${id}`);
  },
};
