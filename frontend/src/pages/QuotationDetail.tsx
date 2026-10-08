import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody,
  Button, Stack, CircularProgress, Grid, Divider, Alert,
} from '@mui/material';
import { quotationsApi } from '../api/quotationsApi';
import { customersApi } from '../api/customersApi';
import { productsApi } from '../api/productsApi';
import { invoicesApi } from '../api/invoicesApi';
import StatusMenu from '../components/StatusMenu';
import ConfirmDialog from '../components/ConfirmDialog';
import { getErrorMessage } from '../utils/api';
import { useState } from 'react';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DownloadIcon from '@mui/icons-material/Download';
import type { QuotationStatus } from '../types/common';

// "Converted" is set automatically when the invoice is created, so it is not a manual choice.
const STATUS_OPTIONS: QuotationStatus[] = ['draft', 'sent', 'approved', 'rejected'];

export default function QuotationDetail() {
  const { id } = useParams<{ id: string }>();
  const quotationId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const quotationQuery = useQuery({
    queryKey: ['quotations', quotationId],
    queryFn: () => quotationsApi.get(quotationId),
  });
  const customersQuery = useQuery({ queryKey: ['customers'], queryFn: customersApi.list });
  const productsQuery = useQuery({ queryKey: ['products'], queryFn: productsApi.list });
  const invoicesQuery = useQuery({ queryKey: ['invoices'], queryFn: invoicesApi.list });

  const productName = (pid: number) => productsQuery.data?.find((p) => p.id === pid)?.name ?? `#${pid}`;

  const statusMutation = useMutation({
    mutationFn: (status: QuotationStatus) => quotationsApi.updateStatus(quotationId, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quotations', quotationId] }),
  });

  const invoiceMutation = useMutation({
    mutationFn: () => invoicesApi.createFromQuotation(quotationId),
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['job-cards'] });
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

  const customer = customersQuery.data?.find((c) => c.id === quotation.customer_id);
  const invoiced = (invoicesQuery.data ?? []).some((inv) => inv.quotation_id === quotation.id);
  const canCreateInvoice = (quotation.status === 'approved' || quotation.status === 'converted') && !invoiced;

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
            {quotation.quotation_number}
          </Typography>
          <Typography color="text.secondary">
            {customer?.name ?? `Customer #${quotation.customer_id}`}
            {quotation.with_gst === false ? ' · Without GST' : ' · With GST'}
          </Typography>
          {(customer?.phone || customer?.email || customer?.address) && (
            <Typography variant="body2" color="text.secondary">
              {[customer?.phone, customer?.email, customer?.address].filter(Boolean).join('  |  ')}
            </Typography>
          )}
        </Box>
        <StatusMenu
          status={quotation.status}
          disabled={invoiced}
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
              {quotation.with_gst !== false && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography color="text.secondary">GST</Typography>
                  <Typography>₹{quotation.tax_amount.toFixed(2)}</Typography>
                </Box>
              )}
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
            {invoiceMutation.isError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {getErrorMessage(invoiceMutation.error, 'Could not create the invoice')}
              </Alert>
            )}
            {!canCreateInvoice && !invoiced && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Mark the quotation as Approved (OK) to create its invoice.
              </Typography>
            )}
            {pdfError && (
              <Alert severity="error" sx={{ mb: 2 }} onClose={() => setPdfError(null)}>
                {pdfError}
              </Alert>
            )}
            <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
              <Button
                variant="outlined"
                startIcon={<VisibilityIcon />}
                onClick={() => quotationsApi.viewPdf(quotation.id).catch((e) => setPdfError(getErrorMessage(e, 'Could not open the quotation')))}
              >
                View
              </Button>
              <Button
                variant="outlined"
                startIcon={<DownloadIcon />}
                onClick={() =>
                  quotationsApi
                    .downloadPdf(quotation.id, quotation.quotation_number)
                    .catch((e) => setPdfError(getErrorMessage(e, 'Could not download the quotation')))
                }
              >
                Download
              </Button>
              {canCreateInvoice && (
                <Button
                  variant="contained"
                  sx={{ bgcolor: '#1a237e' }}
                  disabled={invoiceMutation.isPending}
                  onClick={() => invoiceMutation.mutate()}
                >
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