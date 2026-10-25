import api from '../utils/api';
import type { Company, HsnCode, HsnInput } from '../types/company';

export const companyApi = {
  get: async (): Promise<Company> => (await api.get('/company/')).data,
  update: async (data: Partial<Company>): Promise<Company> => (await api.put('/company/', data)).data,
};

export const hsnApi = {
  list: async (): Promise<HsnCode[]> => (await api.get('/hsn-codes/')).data,
  create: async (data: HsnInput): Promise<HsnCode> => (await api.post('/hsn-codes/', data)).data,
  update: async (id: number, data: Partial<HsnInput>): Promise<HsnCode> => (await api.put(`/hsn-codes/${id}`, data)).data,
  remove: async (id: number): Promise<void> => {
    await api.delete(`/hsn-codes/${id}`);
  },
};
