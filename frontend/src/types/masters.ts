import type { MasterEntity } from './common';

export type PrintingType = MasterEntity;
export type Machine = MasterEntity;

export interface Tax {
  id: number;
  name: string;
  rate_percent: number;
  is_default: boolean;
  is_active: boolean;
}
