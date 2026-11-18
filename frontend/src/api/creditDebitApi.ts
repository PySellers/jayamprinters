import api from '../utils/api';
import type {
  CreditDebitEntry, CreditDebitFilters, CreditDebitInput, CreditDebitKind, CreditDebitSummary, CreditDebitUpdateInput,
} from '../types/creditDebit';

const clean = (f: CreditDebitFilters) =>
  Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== ''));

export const creditDebitApi = {
  list: async (kind: CreditDebitKind | undefined, filters: CreditDebitFilters): Promise<CreditDebitEntry[]> =>
    (await api.get('/credit-debit/entries', { params: { ...(kind ? { kind } : {}), ...clean(filters) } })).data,
  add: async (data: CreditDebitInput): Promise<CreditDebitEntry> => (await api.post('/credit-debit/entries', data)).data,
  update: async (id: number, data: CreditDebitUpdateInput): Promise<CreditDebitEntry> =>
    (await api.put(`/credit-debit/entries/${id}`, data)).data,
  remove: async (id: number): Promise<void> => {
    await api.delete(`/credit-debit/entries/${id}`);
  },
  names: async (): Promise<string[]> => (await api.get('/credit-debit/names')).data,
  summary: async (filters: CreditDebitFilters): Promise<CreditDebitSummary> =>
    (await api.get('/credit-debit/summary', { params: clean(filters) })).data,
  // Excel copy of what the filters show (two sheets + balance by name)
  exportExcel: async (filters: CreditDebitFilters): Promise<void> => {
    const response = await api.get('/credit-debit/export', { params: clean(filters), responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'credit-debit-book.xlsx';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};
