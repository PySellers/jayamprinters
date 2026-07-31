import api from '../utils/api';
import type { DeliveryChallan, DeliveryChallanInput } from '../types/deliveryChallans';

export const deliveryChallansApi = {
  list: async (): Promise<DeliveryChallan[]> => (await api.get('/delivery-challans/')).data,
  get: async (id: number): Promise<DeliveryChallan> => (await api.get(`/delivery-challans/${id}`)).data,
  create: async (data: DeliveryChallanInput): Promise<DeliveryChallan> =>
    (await api.post('/delivery-challans/', data)).data,
};
