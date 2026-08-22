import api from '../utils/api';
import type { Quotation, QuotationCreateInput, QuotationPreviewRequest, QuotationPreview } from '../types/quotations';
import type { QuotationStatus } from '../types/common';
import type { JobCard } from '../types/jobCards';

export const quotationsApi = {
  list: async (): Promise<Quotation[]> => (await api.get('/quotations/')).data,
  get: async (id: number): Promise<Quotation> => (await api.get(`/quotations/${id}`)).data,
  create: async (data: QuotationCreateInput): Promise<Quotation> =>
    (await api.post('/quotations/', data)).data,
  preview: async (data: QuotationPreviewRequest): Promise<QuotationPreview> =>
    (await api.post('/quotations/preview', data)).data,
  remove: async (id: number): Promise<void> => {
    await api.delete(`/quotations/${id}`);
  },
  updateStatus: async (id: number, status: QuotationStatus): Promise<Quotation> =>
    (await api.patch(`/quotations/${id}/status`, { status })).data,
  convert: async (id: number): Promise<JobCard[]> =>
    (await api.post(`/quotations/${id}/convert`)).data,
};
