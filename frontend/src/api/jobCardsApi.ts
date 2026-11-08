import api from '../utils/api';
import type {
  JobCard, JobCardCreateInput, JobCardUpdateInput, JobCardComment, JobCardCommentInput,
  JobCardSheet, JobCardSheetData, JobCardDetail, JobProof, ProofStatus,
} from '../types/jobCards';
import type { JobCardStatus } from '../types/common';

export const jobCardsApi = {
  list: async (): Promise<JobCard[]> => (await api.get('/job-cards/')).data,
  get: async (id: number): Promise<JobCard> => (await api.get(`/job-cards/${id}`)).data,
  create: async (data: JobCardCreateInput): Promise<JobCard> =>
    (await api.post('/job-cards/', data)).data,
  update: async (id: number, data: JobCardUpdateInput): Promise<JobCard> =>
    (await api.put(`/job-cards/${id}`, data)).data,
  detail: async (id: number, withPrice = true): Promise<JobCardDetail> =>
    (await api.get(`/job-cards/${id}/detail`, { params: { with_price: withPrice } })).data,
  // Opens the printable job card (status as of now) in a new tab, with or without prices.
  // The tab is opened straight away (inside the click) so pop-up blockers do not stop it.
  printCard: async (id: number, withPrice: boolean): Promise<void> => {
    const popup = window.open('', '_blank');
    try {
      const response = await api.get(`/job-cards/${id}/pdf`, { params: { with_price: withPrice }, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      if (popup) popup.location.href = url;
      else window.open(url, '_blank');
      setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      popup?.close();
      throw error;
    }
  },
  proofs: async (id: number): Promise<JobProof[]> => (await api.get(`/job-cards/${id}/proofs`)).data,
  addProof: async (id: number, data: { due_date?: string | null; due_time?: string | null; notes?: string | null; handled_by?: number | null }): Promise<JobProof> =>
    (await api.post(`/job-cards/${id}/proofs`, data)).data,
  updateProof: async (proofId: number, data: { due_date?: string | null; due_time?: string | null; status?: ProofStatus; notes?: string | null; handled_by?: number | null }): Promise<JobProof> =>
    (await api.put(`/job-proofs/${proofId}`, data)).data,
  removeProof: async (proofId: number): Promise<void> => {
    await api.delete(`/job-proofs/${proofId}`);
  },
  getSheet: async (id: number): Promise<JobCardSheet> => (await api.get(`/job-cards/${id}/sheet`)).data,
  saveSheet: async (id: number, sheet: JobCardSheetData): Promise<JobCardSheet> =>
    (await api.put(`/job-cards/${id}/sheet`, { sheet })).data,
  updateStatus: async (id: number, status: JobCardStatus): Promise<JobCard> =>
    (await api.patch(`/job-cards/${id}/status`, { status })).data,
  remove: async (id: number): Promise<void> => {
    await api.delete(`/job-cards/${id}`);
  },
  listComments: async (id: number): Promise<JobCardComment[]> =>
    (await api.get(`/job-cards/${id}/comments`)).data,
  addComment: async (id: number, data: JobCardCommentInput): Promise<JobCardComment> =>
    (await api.post(`/job-cards/${id}/comments`, data)).data,
};