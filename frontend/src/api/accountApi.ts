import api from '../utils/api';
import type { UserRole } from '../types/common';

export interface Contact {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  phone?: string | null;
}

export interface AboutInfo {
  product: string;
  version: string;
  release_date: string;
  session_hours: number;
}

/** The signed-in employee's own profile, the Contacts list and the About box. */
export const accountApi = {
  updateProfile: async (data: { name?: string; phone?: string | null }): Promise<{ id: number; name: string; email: string; role: UserRole; phone?: string | null }> =>
    (await api.patch('/auth/me', data)).data,
  changePassword: async (current_password: string, new_password: string): Promise<void> => {
    await api.post('/auth/change-password', { current_password, new_password });
  },
  contacts: async (): Promise<Contact[]> => (await api.get('/auth/contacts')).data,
  about: async (): Promise<AboutInfo> => (await api.get('/auth/about')).data,
};
