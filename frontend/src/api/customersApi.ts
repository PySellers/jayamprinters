import api from '../utils/api';
import type { Customer, CustomerInput } from '../types/customers';

export const customersApi = {
  list: async (): Promise<Customer[]> => (await api.get('/customers/')).data,
  get: async (id: number): Promise<Customer> => (await api.get(`/customers/${id}`)).data,
  create: async (data: CustomerInput): Promise<Customer> => (await api.post('/customers/', data)).data,
  update: async (id: number, data: Partial<CustomerInput>): Promise<Customer> =>
    (await api.put(`/customers/${id}`, data)).data,
  remove: async (id: number): Promise<void> => {
    await api.delete(`/customers/${id}`);
  },
  search: async (query: string): Promise<Customer[]> =>
    (await api.get(`/customers/search/${encodeURIComponent(query)}`)).data,
};
