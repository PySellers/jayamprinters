import api from '../utils/api';
import type { OutsourceInput, OutsourceJob } from '../types/outsource';

export const outsourceApi = {
  list: async (): Promise<OutsourceJob[]> => (await api.get('/outsource/')).data,
  create: async (data: OutsourceInput): Promise<OutsourceJob> => (await api.post('/outsource/', data)).data,
  update: async (id: number, data: Partial<OutsourceInput>): Promise<OutsourceJob> => (await api.put(`/outsource/${id}`, data)).data,
  pay: async (id: number, amount: number): Promise<OutsourceJob> => (await api.post(`/outsource/${id}/payments`, { amount })).data,
  remove: async (id: number): Promise<void> => {
    await api.delete(`/outsource/${id}`);
  },
};
