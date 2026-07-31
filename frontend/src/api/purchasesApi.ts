import api from '../utils/api';
import type {
  Vendor, VendorInput, InventoryItem, InventoryItemInput,
  StockMovement, StockAdjustmentInput, Purchase, PurchaseInput, PurchasePaymentInput,
} from '../types/purchases';

export const vendorsApi = {
  list: async (): Promise<Vendor[]> => (await api.get('/vendors/')).data,
  get: async (id: number): Promise<Vendor> => (await api.get(`/vendors/${id}`)).data,
  create: async (data: VendorInput): Promise<Vendor> => (await api.post('/vendors/', data)).data,
  update: async (id: number, data: Partial<VendorInput>): Promise<Vendor> =>
    (await api.put(`/vendors/${id}`, data)).data,
  remove: async (id: number): Promise<void> => {
    await api.delete(`/vendors/${id}`);
  },
};

export const inventoryItemsApi = {
  list: async (): Promise<InventoryItem[]> => (await api.get('/inventory-items/')).data,
  get: async (id: number): Promise<InventoryItem> => (await api.get(`/inventory-items/${id}`)).data,
  create: async (data: InventoryItemInput): Promise<InventoryItem> =>
    (await api.post('/inventory-items/', data)).data,
  update: async (id: number, data: Partial<InventoryItemInput>): Promise<InventoryItem> =>
    (await api.put(`/inventory-items/${id}`, data)).data,
  remove: async (id: number): Promise<void> => {
    await api.delete(`/inventory-items/${id}`);
  },
  adjust: async (id: number, data: StockAdjustmentInput): Promise<InventoryItem> =>
    (await api.post(`/inventory-items/${id}/adjust`, data)).data,
  movements: async (id: number): Promise<StockMovement[]> =>
    (await api.get(`/inventory-items/${id}/movements`)).data,
};

export const purchasesApi = {
  list: async (): Promise<Purchase[]> => (await api.get('/purchases/')).data,
  get: async (id: number): Promise<Purchase> => (await api.get(`/purchases/${id}`)).data,
  create: async (data: PurchaseInput): Promise<Purchase> => (await api.post('/purchases/', data)).data,
  remove: async (id: number): Promise<void> => {
    await api.delete(`/purchases/${id}`);
  },
  addPayment: async (purchaseId: number, data: PurchasePaymentInput): Promise<Purchase> =>
    (await api.post(`/purchases/${purchaseId}/payments`, data)).data,
  removePayment: async (paymentId: number): Promise<void> => {
    await api.delete(`/purchase-payments/${paymentId}`);
  },
};
