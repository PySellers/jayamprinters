import api from '../utils/api';
import type { AppUser, UserCreateInput, UserUpdateInput } from '../types/users';

export const usersApi = {
  list: async (): Promise<AppUser[]> => (await api.get('/users/')).data,
  get: async (id: number): Promise<AppUser> => (await api.get(`/users/${id}`)).data,
  create: async (data: UserCreateInput): Promise<AppUser> => (await api.post('/users/', data)).data,
  update: async (id: number, data: UserUpdateInput): Promise<AppUser> => (await api.patch(`/users/${id}`, data)).data,
  remove: async (id: number): Promise<void> => {
    await api.delete(`/users/${id}`);
  },
};
