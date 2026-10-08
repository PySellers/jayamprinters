import api from '../utils/api';
import type { DeliveryChallan, DeliveryChallanInput } from '../types/deliveryChallans';

const fetchPdfBlob = async (challanId: number): Promise<Blob> => {
  const response = await api.get(`/delivery-challans/${challanId}/pdf`, { responseType: 'blob' });
  return new Blob([response.data], { type: 'application/pdf' });
};

export const deliveryChallansApi = {
  list: async (): Promise<DeliveryChallan[]> => (await api.get('/delivery-challans/')).data,
  // The job card's challan if it has one, otherwise an unsaved draft.
  draft: async (jobCardId: number): Promise<DeliveryChallan> =>
    (await api.get(`/delivery-challans/draft/${jobCardId}`)).data,
  create: async (jobCardId: number, data: DeliveryChallanInput): Promise<DeliveryChallan> =>
    (await api.post('/delivery-challans/', { job_card_id: jobCardId, ...data })).data,
  update: async (id: number, data: DeliveryChallanInput): Promise<DeliveryChallan> =>
    (await api.put(`/delivery-challans/${id}`, data)).data,

  // Pass a tab that was opened inside the click (window.open('', '_blank')) so
  // pop-up blockers don't stop it; otherwise one is opened here.
  viewPdf: async (challanId: number, existingPopup?: Window | null): Promise<void> => {
    const popup = existingPopup ?? window.open('', '_blank');
    try {
      const url = window.URL.createObjectURL(await fetchPdfBlob(challanId));
      if (popup) popup.location.href = url;
      else window.open(url, '_blank');
      setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      popup?.close();
      throw error;
    }
  },
  downloadPdf: async (challanId: number, fileName: string): Promise<void> => {
    const url = window.URL.createObjectURL(await fetchPdfBlob(challanId));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};