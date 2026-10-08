import api from '../utils/api';
import type { Quotation, QuotationCreateInput, QuotationPreviewRequest, QuotationPreview } from '../types/quotations';
import type { QuotationStatus } from '../types/common';
import type { JobCard } from '../types/jobCards';

const fetchPdfBlob = async (id: number): Promise<Blob> => {
  const response = await api.get(`/quotations/${id}/pdf`, { responseType: 'blob' });
  return new Blob([response.data], { type: 'application/pdf' });
};

export const quotationsApi = {
  // Opens the quotation letter in a new tab. The tab is opened inside the click
  // so pop-up blockers don't stop it.
  viewPdf: async (id: number): Promise<void> => {
    const popup = window.open('', '_blank');
    try {
      const url = window.URL.createObjectURL(await fetchPdfBlob(id));
      if (popup) popup.location.href = url;
      else window.open(url, '_blank');
      setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      popup?.close();
      throw error;
    }
  },
  downloadPdf: async (id: number, quotationNumber: string): Promise<void> => {
    const url = window.URL.createObjectURL(await fetchPdfBlob(id));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${quotationNumber}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
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