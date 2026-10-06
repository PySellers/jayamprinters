import api from '../utils/api';
import type { Product, ProductInput, ProductCategory } from '../types/products';

export const productsApi = {
  list: async (): Promise<Product[]> => (await api.get('/products/')).data,
  get: async (id: number): Promise<Product> => (await api.get(`/products/${id}`)).data,
  create: async (data: ProductInput): Promise<Product> => (await api.post('/products/', data)).data,
  update: async (id: number, data: Partial<ProductInput>): Promise<Product> =>
    (await api.put(`/products/${id}`, data)).data,
  remove: async (id: number): Promise<void> => {
    await api.delete(`/products/${id}`);
  },
};

export const productCategoriesApi = {
  list: async (): Promise<ProductCategory[]> => (await api.get('/product-categories/')).data,
};
