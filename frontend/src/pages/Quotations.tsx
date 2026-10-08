import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody,
  Button, CircularProgress, Alert, Stack,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DownloadIcon from '@mui/icons-material/Download';
import { quotationsApi } from '../api/quotationsApi';
import { customersApi } from '../api/customersApi';
import { invoicesApi } from '../api/invoicesApi';
import { getErrorMessage } from '../utils/api';
import StatusMenu from '../components/StatusMenu';
import type { QuotationStatus } from '../types/common';

// "Converted" is set automatically when the invoice is created, so it is not a manual choice.
const STATUS_OPTIONS: QuotationStatus[] = ['draft', 'sent', 'approved', 'rejected'];
const STATUS_COLORS: Record<string, 'default' | 'info' | 'success' | 'error' | 'primary'> = {
  draft: 'default',
  sent: 'info',
  approved: 'success',
  rejected: 'error',
  converted: 'primary',
};

export default function Quotations() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [invoicingId, setInvoicingId] = useState<number | null>(null);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const quotationsQuery = useQuery({ queryKey: ['quotations'], queryFn: quotationsApi.list });
  const customersQuery = useQuery({ queryKey: ['customers'], queryFn: customersApi.list });
  const invoicesQuery = useQuery({ queryKey: ['invoices'], queryFn: invoicesApi.list });

  const customerName = (id: number) => customersQuery.data?.find((c) => c.id === id)?.name ?? `#${id}`;
  const invoicedQuotationIds = new Set((invoicesQuery.data ?? []).map((inv) => inv.quotation_id));

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: QuotationStatus }) =>
      quotationsApi.updateStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quotations'] }),
  });

  // Create Invoice (on an approved quotation) also creates its job cards, then opens the invoice.
  const invoiceMutation = useMutation({
    mutationFn: (quotationId: number) => invoicesApi.createFromQuotation(quotationId),
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['job-cards'] });
      setInvoicingId(null);
      navigate(`/invoices/${invoice.id}`);
    },
    onError: () => setInvoicingId(null),
  });

  const runPdf = async (key: string, action: () => Promise<void>) => {
    setPdfError(null);
    setPdfBusy(key);
    try {
      await action();
    } catch (error) {
      setPdfError(getErrorMessage(error, 'Could not open the quotation'));
    } finally {
      setPdfBusy(null);
    }
  };

  const canCreateInvoice = (status: string, id: number) =>
    (status === 'approved' || status === 'converted') && !invoicedQuotationIds.has(id);

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
          Quotations
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} sx={{ bgcolor: '#1a237e' }} onClick={() => navigate('/quotations/new')}>
          New Quotation
        </Button>
      </Box>

      {pdfError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setPdfError(null)}>
          {pdfError}
        </Alert>
      )}
      {invoiceMutation.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {getErrorMessage(invoiceMutation.error, 'Could not create the invoice')}
        </Alert>
      )}

      <Paper sx={{ borderRadius: 2 }}>
        {quotationsQuery.isLoading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <CircularProgress />
          </Box>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Quotation #</TableCell>
                <TableCell>Customer</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Grand Total</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(quotationsQuery.data ?? []).map((q) => (
                <TableRow key={q.id} hover sx={{ cursor: 'pointer' }}>
                  <TableCell onClick={() => navigate(`/quotations/${q.id}`)}>{q.quotation_number}</TableCell>
                  <TableCell onClick={() => navigate(`/quotations/${q.id}`)}>{customerName(q.customer_id)}</TableCell>
                  <TableCell>
                    <StatusMenu
                      status={q.status}
                      allowedStatuses={STATUS_OPTIONS}
                      colorMap={STATUS_COLORS}
                      disabled={invoicedQuotationIds.has(q.id)}
                      onChange={(status) => statusMutation.mutate({ id: q.id, status: status as QuotationStatus })}
                    />
                  </TableCell>
                  <TableCell onClick={() => navigate(`/quotations/${q.id}`)}>₹{q.grand_total.toFixed(2)}</TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={pdfBusy === `view-${q.id}` ? <CircularProgress size={14} /> : <VisibilityIcon />}
                        disabled={pdfBusy !== null}
                        onClick={() => runPdf(`view-${q.id}`, () => quotationsApi.viewPdf(q.id))}
                      >
                        View
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={pdfBusy === `dl-${q.id}` ? <CircularProgress size={14} /> : <DownloadIcon />}
                        disabled={pdfBusy !== null}
                        onClick={() => runPdf(`dl-${q.id}`, () => quotationsApi.downloadPdf(q.id, q.quotation_number))}
                      >
                        Download
                      </Button>
                      {canCreateInvoice(q.status, q.id) && (
                        <Button
                          size="small"
                          variant="contained"
                          sx={{ bgcolor: '#1a237e' }}
                          disabled={invoiceMutation.isPending && invoicingId === q.id}
                          onClick={() => {
                            setInvoicingId(q.id);
                            invoiceMutation.mutate(q.id);
                          }}
                        >
                          Create Invoice
                        </Button>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
              {(quotationsQuery.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                    No quotations yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Paper>
    </Box>
  );
}