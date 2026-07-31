export type UserRole = 'admin' | 'counter' | 'production' | 'accounts';

export interface AppUser {
  id: number;
  name: string;
  email: string;
  is_active: boolean;
  role: UserRole;
  department?: string | null;
}

export interface UserCreateInput {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  department?: string | null;
}

export interface UserUpdateInput {
  name?: string;
  role?: UserRole;
  department?: string | null;
  is_active?: boolean;
}
