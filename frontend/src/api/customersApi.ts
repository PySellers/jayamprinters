import api from '../utils/api';
import type { BillingDefaults, Customer, CustomerInput, CustomerOrders } from '../types/customers';

export const customersApi = {
  list: async (): Promise<Customer[]> => (await api.get('/customers/')).data,
  get: async (id: number): Promise<Customer> => (await api.get(`/customers/${id}`)).data,
  create: async (data: CustomerInput): Promise<Customer> => (await api.post('/customers/', data)).data,
  update: async (id: number, data: Partial<CustomerInput>): Promise<Customer> =>
    (await api.put(`/customers/${id}`, data)).data,
  remove: async (id: number): Promise<void> => {
    await api.delete(`/customers/${id}`);
  },
  billingDefaults: async (): Promise<BillingDefaults> => (await api.get('/customers/billing-defaults')).data,
  orders: async (id: number): Promise<CustomerOrders> => (await api.get(`/customers/${id}/orders`)).data,
  /** Admin: every customer and employee phone number as a .vcf (phone / Google Contacts) or Google CSV file. */
  exportContacts: async (format: 'vcf' | 'csv'): Promise<void> => {
    const response = await api.get('/customers/export/contacts', { params: { format }, responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.download = `sri-jayam-contacts.${format}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
  contactCount: async (): Promise<number> => (await api.get('/customers/export/contacts', { params: { format: 'count' } })).data.count,
  search: async (query: string): Promise<Customer[]> =>
    (await api.get(`/customers/search/${encodeURIComponent(query)}`)).data,
};
