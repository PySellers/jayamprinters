import api from '../utils/api';
import type { CashSummary, ChequeEntry } from '../types/cashLedger';

export const cashLedgerApi = {
  summary: async (): Promise<CashSummary> => (await api.get('/cash-ledger/summary')).data,
  cheques: async (): Promise<ChequeEntry[]> => (await api.get('/cash-ledger/cheques')).data,
};
