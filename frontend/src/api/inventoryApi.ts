import api from '../utils/api';
import type { InventoryItem, InventoryItemInput } from '../types/purchases';

export const inventoryApi = {
  list: async (): Promise<InventoryItem[]> => (await api.get('/inventory/')).data,
  lowStock: async (): Promise<InventoryItem[]> => (await api.get('/inventory/low-stock')).data,
  get: async (id: number): Promise<InventoryItem> => (await api.get(`/inventory/${id}`)).data,
  create: async (data: InventoryItemInput): Promise<InventoryItem> => (await api.post('/inventory/', data)).data,
  update: async (id: number, data: Partial<InventoryItemInput>): Promise<InventoryItem> =>
    (await api.put(`/inventory/${id}`, data)).data,
  remove: async (id: number): Promise<void> => {
    await api.delete(`/inventory/${id}`);
  },
};
