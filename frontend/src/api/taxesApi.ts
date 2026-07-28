import api from '../utils/api';
import type { Tax } from '../types/masters';

export const taxesApi = {
  list: async (): Promise<Tax[]> => (await api.get('/taxes/')).data,
  get: async (id: number): Promise<Tax> => (await api.get(`/taxes/${id}`)).data,
  create: async (data: Omit<Tax, 'id'>): Promise<Tax> => (await api.post('/taxes/', data)).data,
  update: async (id: number, data: Partial<Omit<Tax, 'id'>>): Promise<Tax> =>
    (await api.put(`/taxes/${id}`, data)).data,
  remove: async (id: number): Promise<void> => {
    await api.delete(`/taxes/${id}`);
  },
};
