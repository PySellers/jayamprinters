import api from '../utils/api';
import type { CashSummary, CashTransactionInput, ChequeTransaction, ChequeTransactionInput } from '../types/cashLedger';
import type { ChequeStatus } from '../types/common';

export const cashLedgerApi = {
  summary: async (): Promise<CashSummary> => (await api.get('/cash-ledger/summary')).data,
  addTransaction: async (data: CashTransactionInput): Promise<void> => {
    await api.post('/cash-ledger/transactions', data);
  },
  listCheques: async (): Promise<ChequeTransaction[]> => (await api.get('/cash-ledger/cheques')).data,
  addCheque: async (data: ChequeTransactionInput): Promise<ChequeTransaction> =>
    (await api.post('/cash-ledger/cheques', data)).data,
  updateChequeStatus: async (id: number, status: ChequeStatus): Promise<ChequeTransaction> =>
    (await api.patch(`/cash-ledger/cheques/${id}/status`, { status })).data,
};
