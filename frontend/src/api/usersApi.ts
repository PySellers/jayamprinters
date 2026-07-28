import api from '../utils/api';
import type { AppUser } from '../types/users';

export const usersApi = {
  list: async (): Promise<AppUser[]> => (await api.get('/users/')).data,
};
