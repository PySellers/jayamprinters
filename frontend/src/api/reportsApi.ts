import api from '../utils/api';
import type { GraphGranularity, GraphSeries, SalesReport } from '../types/reports';

export const reportsApi = {
  sales: async (start: string, end: string): Promise<SalesReport> =>
    (await api.get('/reports/sales', { params: { start, end } })).data,
  graph: async (metric: 'sales' | 'expense', granularity: GraphGranularity, start: string, end: string): Promise<GraphSeries> =>
    (await api.get('/reports/graph', { params: { metric, granularity, start, end } })).data,
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
