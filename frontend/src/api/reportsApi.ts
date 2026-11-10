import api from '../utils/api';
import type { AccountStatement, FinancialStatement, Insights, SalesReport, StatementGroup } from '../types/reports';

export const reportsApi = {
  /** AI Insights: forecasts, service and team performance, advice (admin only; others get a 403). */
  insights: async (days = 180): Promise<Insights> => (await api.get('/reports/insights', { params: { days } })).data,
  statement: async (start: string, end: string, group: StatementGroup): Promise<FinancialStatement> =>
    (await api.get('/reports/statement', { params: { start, end, group } })).data,
  downloadStatementExcel: async (start: string, end: string, group: StatementGroup): Promise<void> => {
    const response = await api.get('/reports/statement/export', { params: { start, end, group }, responseType: 'blob' });
    const url = window.URL.createObjectURL(
      new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `financial-statement-${start}-to-${end}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
  ledger: async (start: string, end: string, group: 'day' | 'week', basis: 'accrual' | 'cash'): Promise<AccountStatement> =>
    (await api.get('/reports/ledger', { params: { start, end, group, basis } })).data,
  downloadLedgerExcel: async (start: string, end: string, group: 'day' | 'week', basis: 'accrual' | 'cash'): Promise<void> => {
    const response = await api.get('/reports/ledger/export', { params: { start, end, group, basis }, responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `account-statement-${start}-to-${end}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
  sales: async (start: string, end: string): Promise<SalesReport> =>
    (await api.get('/reports/sales', { params: { start, end } })).data,
  downloadSalesExcel: async (start: string, end: string): Promise<void> => {
    const response = await api.get('/reports/sales/export', { params: { start, end }, responseType: 'blob' });
    const url = window.URL.createObjectURL(
      new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `sales-report-${start}-to-${end}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};
