import api from '../utils/api';
import type { PriceMatrixCell, PriceMatrixCellInput } from '../types/priceMatrix';

export const priceMatrixApi = {
  list: async (productId: number): Promise<PriceMatrixCell[]> =>
    (await api.get('/price-matrix-cells/', { params: { product_id: productId } })).data,
  get: async (id: number): Promise<PriceMatrixCell> => (await api.get(`/price-matrix-cells/${id}`)).data,
  create: async (data: PriceMatrixCellInput): Promise<PriceMatrixCell> =>
    (await api.post('/price-matrix-cells/', data)).data,
  update: async (id: number, data: Partial<PriceMatrixCellInput>): Promise<PriceMatrixCell> =>
    (await api.put(`/price-matrix-cells/${id}`, data)).data,
  remove: async (id: number): Promise<void> => {
    await api.delete(`/price-matrix-cells/${id}`);
  },
};
