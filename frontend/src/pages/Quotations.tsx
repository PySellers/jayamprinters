import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody,
  Button, CircularProgress, Stack,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { quotationsApi } from '../api/quotationsApi';
import { customersApi } from '../api/customersApi';
import { invoicesApi } from '../api/invoicesApi';
import StatusMenu from '../components/StatusMenu';
import type { QuotationStatus } from '../types/common';

const STATUS_OPTIONS: QuotationStatus[] = ['draft', 'sent', 'approved', 'rejected', 'converted'];
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
  const [convertingId, setConvertingId] = useState<number | null>(null);
  const [invoicingId, setInvoicingId] = useState<number | null>(null);

  const quotationsQuery = useQuery({ queryKey: ['quotations'], queryFn: quotationsApi.list });
  const customersQuery = useQuery({ queryKey: ['customers'], queryFn: customersApi.list });

  const customerName = (id: number) => customersQuery.data?.find((c) => c.id === id)?.name ?? `#${id}`;

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: QuotationStatus }) =>
      quotationsApi.updateStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quotations'] }),
  });

  const convertMutation = useMutation({
    mutationFn: (id: number) => quotationsApi.convert(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      queryClient.invalidateQueries({ queryKey: ['job-cards'] });
      setConvertingId(null);
    },
    onError: () => setConvertingId(null),
  });

  const invoiceMutation = useMutation({
    mutationFn: (quotationId: number) => invoicesApi.createFromQuotation(quotationId),
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setInvoicingId(null);
      navigate(`/invoices/${invoice.id}`);
    },
    onError: () => setInvoicingId(null),
  });

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
                      onChange={(status) => statusMutation.mutate({ id: q.id, status: status as QuotationStatus })}
                    />
                  </TableCell>
                  <TableCell onClick={() => navigate(`/quotations/${q.id}`)}>₹{q.grand_total.toFixed(2)}</TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                      {q.status !== 'converted' && (
                        <Button
                          size="small"
                          disabled={convertMutation.isPending && convertingId === q.id}
                          onClick={() => {
                            setConvertingId(q.id);
                            convertMutation.mutate(q.id);
                          }}
                        >
                          Convert
                        </Button>
                      )}
                      {q.status === 'converted' && (
                        <Button
                          size="small"
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
