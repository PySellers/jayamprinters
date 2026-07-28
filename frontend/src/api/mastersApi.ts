import api from '../utils/api';
import type { MasterEntity, PricedMasterEntity } from '../types/common';

export function createMasterApi<T extends MasterEntity>(endpoint: string) {
  return {
    list: async (): Promise<T[]> => (await api.get(`${endpoint}/`)).data,
    get: async (id: number): Promise<T> => (await api.get(`${endpoint}/${id}`)).data,
    create: async (data: Partial<T>): Promise<T> => (await api.post(`${endpoint}/`, data)).data,
    update: async (id: number, data: Partial<T>): Promise<T> =>
      (await api.put(`${endpoint}/${id}`, data)).data,
    remove: async (id: number): Promise<void> => {
      await api.delete(`${endpoint}/${id}`);
    },
  };
}

export interface MasterConfig {
  slug: string;
  label: string;
  endpoint: string;
  hasExtraPrice: boolean;
  api: ReturnType<typeof createMasterApi<MasterEntity | PricedMasterEntity>>;
}

export const mastersConfig: MasterConfig[] = [
  { slug: 'printing-types', label: 'Printing Types', endpoint: '/printing-types', hasExtraPrice: false, api: createMasterApi('/printing-types') },
  { slug: 'machines', label: 'Machines', endpoint: '/machines', hasExtraPrice: false, api: createMasterApi('/machines') },
  { slug: 'product-categories', label: 'Product Categories', endpoint: '/product-categories', hasExtraPrice: false, api: createMasterApi('/product-categories') },
];

export function getMasterConfig(slug: string): MasterConfig | undefined {
  return mastersConfig.find((c) => c.slug === slug);
}
