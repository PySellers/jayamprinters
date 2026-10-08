import api from '../utils/api';
import type {
  JobCard, JobCardCreateInput, JobCardUpdateInput, JobCardComment, JobCardCommentInput,
  JobCardSheet, JobCardSheetData,
} from '../types/jobCards';
import type { JobCardStatus } from '../types/common';

export const jobCardsApi = {
  list: async (): Promise<JobCard[]> => (await api.get('/job-cards/')).data,
  get: async (id: number): Promise<JobCard> => (await api.get(`/job-cards/${id}`)).data,
  create: async (data: JobCardCreateInput): Promise<JobCard> =>
    (await api.post('/job-cards/', data)).data,
  update: async (id: number, data: JobCardUpdateInput): Promise<JobCard> =>
    (await api.put(`/job-cards/${id}`, data)).data,
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