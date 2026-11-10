import api from '../utils/api';
import type { OutsourceInput, OutsourceJob } from '../types/outsource';

export const outsourceApi = {
  list: async (): Promise<OutsourceJob[]> => (await api.get('/outsource/')).data,
  create: async (data: OutsourceInput): Promise<OutsourceJob> => (await api.post('/outsource/', data)).data,
  update: async (id: number, data: Partial<OutsourceInput>): Promise<OutsourceJob> => (await api.put(`/outsource/${id}`, data)).data,
  pay: async (id: number, data: { amount: number; method?: string | null; reference_number?: string | null; upi_id?: string | null; bank_details?: string | null; notes?: string | null }): Promise<OutsourceJob> =>
    (await api.post(`/outsource/${id}/payments`, data)).data,
  remove: async (id: number): Promise<void> => {
    await api.delete(`/outsource/${id}`);
  },
};
