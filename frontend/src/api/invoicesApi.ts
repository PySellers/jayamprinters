import api from '../utils/api';
import type { Invoice, PaymentInput } from '../types/invoices';

export type InvoicePrintFormat = 'a4' | 'thermal_58' | 'thermal_80';

export const invoicesApi = {
  list: async (): Promise<Invoice[]> => (await api.get('/invoices/')).data,
  get: async (id: number): Promise<Invoice> => (await api.get(`/invoices/${id}`)).data,
  remove: async (id: number): Promise<void> => {
    await api.delete(`/invoices/${id}`);
  },
  createFromQuotation: async (quotationId: number): Promise<Invoice> =>
    (await api.post(`/invoices/from-quotation/${quotationId}`)).data,
  addPayment: async (invoiceId: number, data: PaymentInput): Promise<Invoice> =>
    (await api.post(`/invoices/${invoiceId}/payments`, data)).data,
  removePayment: async (paymentId: number): Promise<void> => {
    await api.delete(`/payments/${paymentId}`);
  },
  downloadPdf: async (invoiceId: number, invoiceNumber: string, format: InvoicePrintFormat = 'a4'): Promise<void> => {
    const response = await api.get(`/invoices/${invoiceId}/pdf`, { params: { format }, responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${invoiceNumber}-${format}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
  // Opens the PDF in a new tab sized for the chosen printer (A4 office/laser
  // printer, or an 80mm/58mm thermal bill-printing machine) so counter staff
  // can hit Ctrl+P / the browser's print button and pick whichever printer
  // is physically connected -- no special driver integration required.
  printPdf: async (invoiceId: number, format: InvoicePrintFormat = 'a4'): Promise<void> => {
    const response = await api.get(`/invoices/${invoiceId}/pdf`, { params: { format }, responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
    window.open(url, '_blank', 'noopener');
    setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
  },
};
