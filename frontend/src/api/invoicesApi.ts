import api from '../utils/api';
import type { Invoice, PaymentInput } from '../types/invoices';
import type { InvoiceStatus } from '../types/common';

export type InvoicePrintFormat = 'a4' | 'thermal_58' | 'thermal_80';
// 'gst'  -> tax INVOICE layout (with CGST / SGST), 'cash' -> CASH BILL layout (no GST)
export type InvoiceBillType = 'gst' | 'cash';

const fetchBillBlob = async (invoiceId: number, type: InvoiceBillType): Promise<Blob> => {
  const response = await api.get(`/invoices/${invoiceId}/bill-pdf`, {
    params: { bill_type: type },
    responseType: 'blob',
  });
  return new Blob([response.data], { type: 'application/pdf' });
};

export const invoicesApi = {
  list: async (): Promise<Invoice[]> => (await api.get('/invoices/')).data,
  get: async (id: number): Promise<Invoice> => (await api.get(`/invoices/${id}`)).data,
  remove: async (id: number): Promise<void> => {
    await api.delete(`/invoices/${id}`);
  },
  createFromQuotation: async (quotationId: number): Promise<Invoice> =>
    (await api.post(`/invoices/from-quotation/${quotationId}`)).data,
  updateStatus: async (invoiceId: number, status: InvoiceStatus): Promise<Invoice> =>
    (await api.put(`/invoices/${invoiceId}/status`, { status })).data,
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
  // View: opens the filled bill in a new tab. The tab is opened straight away
  // (inside the click) so browser pop-up blockers don't stop it.
  viewBill: async (invoiceId: number, type: InvoiceBillType): Promise<void> => {
    const popup = window.open('', '_blank');
    try {
      const url = window.URL.createObjectURL(await fetchBillBlob(invoiceId, type));
      if (popup) popup.location.href = url;
      else window.open(url, '_blank');
      setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      popup?.close();
      throw error;
    }
  },
  downloadBill: async (invoiceId: number, invoiceNumber: string, type: InvoiceBillType): Promise<void> => {
    const url = window.URL.createObjectURL(await fetchBillBlob(invoiceId, type));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${invoiceNumber}-${type === 'gst' ? 'gst-invoice' : 'cash-bill'}.pdf`;
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