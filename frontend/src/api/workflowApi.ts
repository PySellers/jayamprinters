import api from '../utils/api';
import type {
  BoardColumn, JobEvent, JobStep, MyWork, ProductionSummary, SendOutInput, Staff, TemplateStep, WorkCenter,
  WorkCenterInput, WorkflowTemplate,
} from '../types/workflow';

export const workflowApi = {
  // ---- work centers & workflows (the admin sets them up)
  workCenters: async (): Promise<WorkCenter[]> => (await api.get('/work-centers/')).data,
  staff: async (): Promise<Staff[]> => (await api.get('/work-centers/staff')).data,
  createWorkCenter: async (data: WorkCenterInput): Promise<WorkCenter> => (await api.post('/work-centers/', data)).data,
  updateWorkCenter: async (id: number, data: Partial<WorkCenterInput>): Promise<WorkCenter> => (await api.put(`/work-centers/${id}`, data)).data,
  setMembers: async (id: number, userIds: number[]): Promise<WorkCenter> => (await api.put(`/work-centers/${id}/members`, { user_ids: userIds })).data,
  removeWorkCenter: async (id: number): Promise<void> => {
    await api.delete(`/work-centers/${id}`);
  },
  templates: async (): Promise<WorkflowTemplate[]> => (await api.get('/workflow-templates/')).data,
  saveTemplate: async (categoryId: number | null, steps: TemplateStep[]): Promise<WorkflowTemplate[]> =>
    (await api.put(`/workflow-templates/${categoryId ?? 'default'}`, {
      steps: steps.map((s) => ({ name: s.name, kind: s.kind, stage: s.stage, work_center_id: s.work_center_id ?? null })),
    })).data,
  resetTemplate: async (categoryId: number): Promise<WorkflowTemplate[]> => (await api.delete(`/workflow-templates/${categoryId}`)).data,

  // ---- the steps of one job card
  steps: async (jobId: number): Promise<JobStep[]> => (await api.get(`/job-cards/${jobId}/steps`)).data,
  timeline: async (jobId: number): Promise<JobEvent[]> => (await api.get(`/job-cards/${jobId}/timeline`)).data,
  addStep: async (jobId: number, data: { name: string; work_center_id?: number | null; kind?: string; stage?: string; after_step_id?: number | null; assigned_to?: number | null }): Promise<JobStep[]> =>
    (await api.post(`/job-cards/${jobId}/steps`, data)).data,
  editStep: async (id: number, data: { name?: string; work_center_id?: number | null; due_date?: string | null; notes?: string | null; kind?: string }): Promise<JobStep> =>
    (await api.put(`/job-steps/${id}`, data)).data,
  removeStep: async (id: number): Promise<void> => {
    await api.delete(`/job-steps/${id}`);
  },
  start: async (id: number): Promise<JobStep> => (await api.post(`/job-steps/${id}/start`)).data,
  complete: async (id: number, note?: string): Promise<JobStep> => (await api.post(`/job-steps/${id}/complete`, { note })).data,
  hold: async (id: number, reason: string): Promise<JobStep> => (await api.post(`/job-steps/${id}/hold`, { reason })).data,
  reopen: async (id: number, note?: string): Promise<JobStep> => (await api.post(`/job-steps/${id}/reopen`, { note })).data,
  skip: async (id: number, note?: string): Promise<JobStep> => (await api.post(`/job-steps/${id}/skip`, { note })).data,
  assign: async (id: number, userId: number | null): Promise<JobStep> => (await api.post(`/job-steps/${id}/assign`, { user_id: userId })).data,
  /** The person doing a task writes their own progress update on it. */
  addUpdate: async (id: number, note: string): Promise<JobStep> => (await api.post(`/job-steps/${id}/update`, { note })).data,
  workLog: async (params: { person_id?: number; start?: string; end?: string; state?: string }) =>
    (await api.get('/production/work-log', { params })).data,
  downloadWorkLog: async (params: { person_id: number; start?: string; end?: string; state?: string }): Promise<void> => {
    const response = await api.get('/production/work-log/export', { params, responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `work-log-${params.person_id}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
  claim: async (id: number): Promise<JobStep> => (await api.post(`/job-steps/${id}/claim`)).data,
  move: async (id: number, direction: 'up' | 'down'): Promise<JobStep> => (await api.post(`/job-steps/${id}/move`, { direction })).data,
  sendOut: async (id: number, data: SendOutInput): Promise<JobStep> => (await api.post(`/job-steps/${id}/send-out`, data)).data,

  // ---- my work, the board, monitoring
  myWork: async (): Promise<MyWork> => (await api.get('/production/my-work')).data,
  board: async (params: { overdue?: boolean; urgent?: boolean; work_center_id?: number }): Promise<{ columns: BoardColumn[] }> =>
    (await api.get('/production/board', { params })).data,
  summary: async (): Promise<ProductionSummary> => (await api.get('/production/summary')).data,
};
