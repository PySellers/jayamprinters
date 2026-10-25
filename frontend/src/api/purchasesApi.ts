import api from '../utils/api';
import type { BillScan, Purchase, PurchaseInput, PurchasePaymentInput } from '../types/purchases';

// the shared client defaults to JSON; a file upload must go out as multipart (axios adds the boundary)
const MULTIPART = { 'Content-Type': 'multipart/form-data' };

export const purchasesApi = {
  list: async (): Promise<Purchase[]> => (await api.get('/purchases/')).data,
  get: async (id: number): Promise<Purchase> => (await api.get(`/purchases/${id}`)).data,
  create: async (data: PurchaseInput): Promise<Purchase> => (await api.post('/purchases/', data)).data,
  scanBill: async (file: File): Promise<BillScan> => {
    const form = new FormData();
    form.append('file', file);
    return (await api.post('/purchases/scan-bill', form, { timeout: 120000, headers: MULTIPART })).data;
  },
  attachBill: async (id: number, file: File): Promise<void> => {
    const form = new FormData();
    form.append('file', file);
    await api.post(`/purchases/${id}/bill`, form, { headers: MULTIPART });
  },
  /** Opens the stored supplier bill in a new tab. */
  openBill: async (id: number): Promise<void> => {
    const response = await api.get(`/purchases/${id}/bill`, { responseType: 'blob' });
    window.open(URL.createObjectURL(response.data), '_blank');
  },
  addPayment: async (id: number, data: PurchasePaymentInput): Promise<Purchase> =>
    (await api.post(`/purchases/${id}/payments`, data)).data,
};
