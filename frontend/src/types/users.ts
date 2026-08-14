import type { UserRole } from './common';

export interface AppUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
}

export interface UserCreateInput {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

export interface UserUpdateInput {
  name?: string;
  role?: UserRole;
  is_active?: boolean;
  password?: string;
}
