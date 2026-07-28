import api from '../utils/api';
import type { QuantitySlab, QuantitySlabInput } from '../types/quantitySlabs';

export const quantitySlabsApi = {
  list: async (categoryId?: number | null): Promise<QuantitySlab[]> =>
    (await api.get('/quantity-slabs/', { params: categoryId ? { category_id: categoryId } : {} })).data,
  get: async (id: number): Promise<QuantitySlab> => (await api.get(`/quantity-slabs/${id}`)).data,
  create: async (data: QuantitySlabInput): Promise<QuantitySlab> => (await api.post('/quantity-slabs/', data)).data,
  update: async (id: number, data: Partial<QuantitySlabInput>): Promise<QuantitySlab> =>
    (await api.put(`/quantity-slabs/${id}`, data)).data,
  remove: async (id: number): Promise<void> => {
    await api.delete(`/quantity-slabs/${id}`);
  },
};
