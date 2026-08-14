import api from '../utils/api';
import type { Purchase, PurchaseInput, PurchasePaymentInput } from '../types/purchases';

export const purchasesApi = {
  list: async (): Promise<Purchase[]> => (await api.get('/purchases/')).data,
  get: async (id: number): Promise<Purchase> => (await api.get(`/purchases/${id}`)).data,
  create: async (data: PurchaseInput): Promise<Purchase> => (await api.post('/purchases/', data)).data,
  addPayment: async (id: number, data: PurchasePaymentInput): Promise<Purchase> =>
    (await api.post(`/purchases/${id}/payments`, data)).data,
};
