import api from '../utils/api';

const MULTIPART = { 'Content-Type': 'multipart/form-data' };

export type PaymentKind = 'sale' | 'purchase' | 'outsource';

/** The UPI screenshot / bank slip kept with a payment. */
export const paymentProofApi = {
  upload: async (kind: PaymentKind, paymentId: number, file: File): Promise<void> => {
    const form = new FormData();
    form.append('file', file);
    await api.post(`/payment-proofs/${kind}/${paymentId}`, form, { headers: MULTIPART });
  },
  open: async (kind: PaymentKind, paymentId: number): Promise<void> => {
    const popup = window.open('', '_blank');
    try {
      const response = await api.get(`/payment-proofs/${kind}/${paymentId}`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      if (popup) popup.location.href = url;
      else window.open(url, '_blank');
    } catch (error) {
      popup?.close();
      throw error;
    }
  },
};

export interface JobMaterial {
  id: number;
  job_card_id: number;
  inventory_item_id: number;
  item_name: string;
  unit: string;
  quantity: number;
  note?: string | null;
  created_by?: string | null;
  customer_name?: string | null;
  stock_left: number;
  low_stock: boolean;
}

/** Stock used by a job: adding takes it out of the stock, removing puts it back. */
export const jobMaterialsApi = {
  list: async (jobId: number): Promise<JobMaterial[]> => (await api.get(`/job-cards/${jobId}/materials`)).data,
  add: async (jobId: number, data: { inventory_item_id: number; quantity: number; note?: string | null }): Promise<JobMaterial> =>
    (await api.post(`/job-cards/${jobId}/materials`, data)).data,
  remove: async (id: number): Promise<void> => {
    await api.delete(`/job-materials/${id}`);
  },
};

export interface AssistantAnswer {
  answer: string;
  link: string;
  sources: { title: string; link: string }[];
  found: boolean;
}

/** The help chat: answers from the manual, inside the application. */
export const assistantApi = {
  ask: async (question: string): Promise<AssistantAnswer> => (await api.post('/assistant/ask', { question })).data,
  topics: async (): Promise<{ title: string; link: string }[]> => (await api.get('/assistant/topics')).data,
};
