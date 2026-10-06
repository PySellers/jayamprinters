import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody,
  Button, Stack, CircularProgress, Grid, Divider,
} from '@mui/material';
import { quotationsApi } from '../api/quotationsApi';
import { customersApi } from '../api/customersApi';
import { productsApi } from '../api/productsApi';
import { invoicesApi } from '../api/invoicesApi';
import StatusMenu from '../components/StatusMenu';
import ConfirmDialog from '../components/ConfirmDialog';
import { useState } from 'react';
import type { QuotationStatus } from '../types/common';

const STATUS_OPTIONS: QuotationStatus[] = ['draft', 'sent', 'approved', 'rejected', 'converted'];

export default function QuotationDetail() {
  const { id } = useParams<{ id: string }>();
  const quotationId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState(false);

  const quotationQuery = useQuery({
    queryKey: ['quotations', quotationId],
    queryFn: () => quotationsApi.get(quotationId),
  });
  const customersQuery = useQuery({ queryKey: ['customers'], queryFn: customersApi.list });
  const productsQuery = useQuery({ queryKey: ['products'], queryFn: productsApi.list });

  const productName = (pid: number) => productsQuery.data?.find((p) => p.id === pid)?.name ?? `#${pid}`;

  const statusMutation = useMutation({
    mutationFn: (status: QuotationStatus) => quotationsApi.updateStatus(quotationId, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quotations', quotationId] }),
  });

  const convertMutation = useMutation({
    mutationFn: () => quotationsApi.convert(quotationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations', quotationId] });
      queryClient.invalidateQueries({ queryKey: ['job-cards'] });
      navigate('/job-cards');
    },
  });

  const invoiceMutation = useMutation({
    mutationFn: () => invoicesApi.createFromQuotation(quotationId),
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      navigate(`/invoices/${invoice.id}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => quotationsApi.remove(quotationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      navigate('/quotations');
    },
  });

  if (quotationQuery.isLoading) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  const quotation = quotationQuery.data;
  if (!quotation) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="error">Quotation not found.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
            {quotation.quotation_number}
          </Typography>
          <Typography color="text.secondary">
            {customersQuery.data?.find((c) => c.id === quotation.customer_id)?.name ?? `Customer #${quotation.customer_id}`}
          </Typography>
        </Box>
        <StatusMenu
          status={quotation.status}
          allowedStatuses={STATUS_OPTIONS}
          onChange={(status) => statusMutation.mutate(status as QuotationStatus)}
        />
      </Box>

      <Paper sx={{ borderRadius: 2, mb: 3 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Product</TableCell>
              <TableCell>Quantity</TableCell>
              <TableCell>Unit Price</TableCell>
              <TableCell>Total</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {quotation.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{productName(item.product_id)}</TableCell>
                <TableCell>{item.quantity}</TableCell>
                <TableCell>₹{item.unit_price.toFixed(2)}</TableCell>
                <TableCell>₹{item.total_price.toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3, borderRadius: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>
              Totals
            </Typography>
            <Stack spacing={0.5}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography color="text.secondary">Subtotal</Typography>
                <Typography>₹{quotation.total_amount.toFixed(2)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography color="text.secondary">Tax</Typography>
                <Typography>₹{quotation.tax_amount.toFixed(2)}</Typography>
              </Box>
              <Divider sx={{ my: 1 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography sx={{ fontWeight: 'bold' }}>Grand Total</Typography>
                <Typography sx={{ fontWeight: 'bold' }}>₹{quotation.grand_total.toFixed(2)}</Typography>
              </Box>
            </Stack>
            {quotation.notes && (
              <Typography sx={{ mt: 2 }} color="text.secondary">
                Notes: {quotation.notes}
              </Typography>
            )}
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3, borderRadius: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 2 }}>
              Actions
            </Typography>
            <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap' }}>
              {quotation.status !== 'converted' && (
                <Button variant="outlined" disabled={convertMutation.isPending} onClick={() => convertMutation.mutate()}>
                  Convert to Job Cards
                </Button>
              )}
              {quotation.status === 'converted' && (
                <Button variant="outlined" disabled={invoiceMutation.isPending} onClick={() => invoiceMutation.mutate()}>
                  Create Invoice
                </Button>
              )}
              <Button color="error" variant="outlined" onClick={() => setDeleting(true)}>
                Delete
              </Button>
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      <ConfirmDialog
        open={deleting}
        title="Delete Quotation"
        message={`Are you sure you want to delete "${quotation.quotation_number}"? This cannot be undone.`}
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
        onCancel={() => setDeleting(false)}
      />
    </Box>
  );
}
