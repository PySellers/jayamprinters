import api from '../utils/api';
import type { Attribute, AttributeInput, AttributeOption, AttributeOptionInput } from '../types/attributes';

export const attributesApi = {
  list: async (categoryId?: number | null): Promise<Attribute[]> =>
    (await api.get('/attributes/', { params: categoryId ? { category_id: categoryId } : {} })).data,
  get: async (id: number): Promise<Attribute> => (await api.get(`/attributes/${id}`)).data,
  create: async (data: AttributeInput): Promise<Attribute> => (await api.post('/attributes/', data)).data,
  update: async (id: number, data: Partial<AttributeInput>): Promise<Attribute> =>
    (await api.put(`/attributes/${id}`, data)).data,
  remove: async (id: number): Promise<void> => {
    await api.delete(`/attributes/${id}`);
  },
  createOption: async (attributeId: number, data: AttributeOptionInput): Promise<AttributeOption> =>
    (await api.post(`/attributes/${attributeId}/options`, data)).data,
  updateOption: async (optionId: number, data: Partial<AttributeOptionInput>): Promise<AttributeOption> =>
    (await api.put(`/attributes/options/${optionId}`, data)).data,
  removeOption: async (optionId: number): Promise<void> => {
    await api.delete(`/attributes/options/${optionId}`);
  },
};
