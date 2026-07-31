import api from '../utils/api';
import type { AppUser, UserCreateInput, UserUpdateInput } from '../types/users';

export const usersApi = {
  list: async (): Promise<AppUser[]> => (await api.get('/users/')).data,
  create: async (data: UserCreateInput): Promise<AppUser> => (await api.post('/users/', data)).data,
  update: async (id: number, data: UserUpdateInput): Promise<AppUser> => (await api.put(`/users/${id}`, data)).data,
};
