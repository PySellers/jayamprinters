import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody,
  Button, IconButton, Chip, CircularProgress, Grid, Stack,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Alert,
  Menu, ListItemIcon, ListItemText,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import PrintIcon from '@mui/icons-material/Print';
import DescriptionIcon from '@mui/icons-material/Description';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import { invoicesApi } from '../api/invoicesApi';
import type { InvoicePrintFormat } from '../api/invoicesApi';
import { getErrorMessage } from '../utils/api';
import { customersApi } from '../api/customersApi';
import { productsApi } from '../api/productsApi';
import type { PaymentInput } from '../types/invoices';
import ConfirmDialog from '../components/ConfirmDialog';
import PaymentDetailsFields, { detailsPayload, emptyPaymentDetails, type PaymentDetails } from '../components/PaymentDetailsFields';
import { paymentProofApi } from '../api/extraApi';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import OrderProduction from '../components/workflow/OrderProduction';
import { RateInfo } from '../components/quotations/PriceBreakdown';

const STATUS_COLORS: Record<string, 'default' | 'warning' | 'success'> = {
  unpaid: 'default',
  partially_paid: 'warning',
  paid: 'success',
};

const PRINT_FORMATS: { format: InvoicePrintFormat; label: string; hint: string; icon: React.ReactNode }[] = [
  { format: 'a4', label: 'A4 Invoice', hint: 'Office / laser printer, full page', icon: <DescriptionIcon fontSize="small" /> },
  { format: 'thermal_80', label: 'Receipt (80mm)', hint: 'Small bill printer, 80mm roll', icon: <ReceiptLongIcon fontSize="small" /> },
  { format: 'thermal_58', label: 'Receipt (58mm)', hint: 'Small bill printer, 58mm roll', icon: <ReceiptLongIcon fontSize="small" /> },
];

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const invoiceId = Number(id);
  const queryClient = useQueryClient();
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = useState<number | null>(null);
  const [details, setDetails] = useState<PaymentDetails>(emptyPaymentDetails());
  const [payBy, setPayBy] = useState('');
  const [printMenuAnchor, setPrintMenuAnchor] = useState<null | HTMLElement>(null);
  const [downloadMenuAnchor, setDownloadMenuAnchor] = useState<null | HTMLElement>(null);

  const invoiceQuery = useQuery({ queryKey: ['invoices', invoiceId], queryFn: () => invoicesApi.get(invoiceId) });
  const customersQuery = useQuery({ queryKey: ['customers'], queryFn: customersApi.list });
  const productsQuery = useQuery({ queryKey: ['products'], queryFn: productsApi.list });

  const productName = (pid: number) => productsQuery.data?.find((p) => p.id === pid)?.name ?? `#${pid}`;

  const { register, handleSubmit, reset, formState: { errors } } = useForm<PaymentInput>({
    defaultValues: { amount: 0, method: 'cash', reference_number: '', notes: '' },
  });

  const paymentMutation = useMutation({
    mutationFn: async (data: PaymentInput) => {
      const before = new Set((invoiceQuery.data?.payments ?? []).map((x) => x.id));
      const updated = await invoicesApi.addPayment(invoiceId, { ...data, ...detailsPayload(details) });
      const created = updated.payments.find((x) => !before.has(x.id));
      if (created && details.file) await paymentProofApi.upload('sale', created.id, details.file);
      return updated;
    },
    onSuccess: () => {
      setDetails(emptyPaymentDetails());
      queryClient.invalidateQueries({ queryKey: ['invoices', invoiceId] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setPaymentDialogOpen(false);
      reset({ amount: 0, method: 'cash', reference_number: '', notes: '' });
    },
  });

  const payByMutation = useMutation({
    mutationFn: (value: string | null) => invoicesApi.setPayBy(invoiceId, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices', invoiceId] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice-dues'] });
    },
  });

  const deletePaymentMutation = useMutation({
    mutationFn: (paymentId: number) => invoicesApi.removePayment(paymentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices', invoiceId] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setDeletingPaymentId(null);
    },
  });

  const downloadPdfMutation = useMutation({
    mutationFn: (format: InvoicePrintFormat) => invoicesApi.downloadPdf(invoiceId, invoiceQuery.data!.invoice_number, format),
  });

  const printPdfMutation = useMutation({
    mutationFn: (format: InvoicePrintFormat) => invoicesApi.printPdf(invoiceId, format),
  });

  if (invoiceQuery.isLoading) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  const invoice = invoiceQuery.data;
  if (!invoice) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="error">Invoice not found.</Typography>
      </Box>
    );
  }

  const balance = invoice.grand_total - invoice.amount_paid;

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
            {invoice.invoice_number}
          </Typography>
          <Typography color="text.secondary">
            {customersQuery.data?.find((c) => c.id === invoice.customer_id)?.name ?? `Customer #${invoice.customer_id}`}
          </Typography>
        </Box>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
          <Chip label={invoice.status.replace('_', ' ')} color={STATUS_COLORS[invoice.status]} />
          <Button
            variant="contained"
            startIcon={printPdfMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <PrintIcon />}
            disabled={printPdfMutation.isPending}
            onClick={(e) => setPrintMenuAnchor(e.currentTarget)}
          >
            Print
          </Button>
          <Menu anchorEl={printMenuAnchor} open={Boolean(printMenuAnchor)} onClose={() => setPrintMenuAnchor(null)}>
            {PRINT_FORMATS.map(({ format, label, hint, icon }) => (
              <MenuItem
                key={format}
                onClick={() => {
                  setPrintMenuAnchor(null);
                  printPdfMutation.mutate(format);
                }}
              >
                <ListItemIcon>{icon}</ListItemIcon>
                <ListItemText primary={label} secondary={hint} />
              </MenuItem>
            ))}
          </Menu>
          <Button
            variant="outlined"
            startIcon={downloadPdfMutation.isPending ? <CircularProgress size={16} /> : <DownloadIcon />}
            disabled={downloadPdfMutation.isPending}
            onClick={(e) => setDownloadMenuAnchor(e.currentTarget)}
          >
            Download
          </Button>
          <Menu anchorEl={downloadMenuAnchor} open={Boolean(downloadMenuAnchor)} onClose={() => setDownloadMenuAnchor(null)}>
            {PRINT_FORMATS.map(({ format, label, hint, icon }) => (
              <MenuItem
                key={format}
                onClick={() => {
                  setDownloadMenuAnchor(null);
                  downloadPdfMutation.mutate(format);
                }}
              >
                <ListItemIcon>{icon}</ListItemIcon>
                <ListItemText primary={label} secondary={hint} />
              </MenuItem>
            ))}
          </Menu>
        </Stack>
      </Box>

      {printPdfMutation.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {getErrorMessage(printPdfMutation.error, 'Failed to open PDF for printing')}
        </Alert>
      )}
      {downloadPdfMutation.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {getErrorMessage(downloadPdfMutation.error, 'Failed to download PDF')}
        </Alert>
      )}

      <Paper sx={{ borderRadius: 2, mb: 3 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Product</TableCell>
              <TableCell>Quantity</TableCell>
              <TableCell>Rate</TableCell>
              <TableCell>Total</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {invoice.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  {productName(item.product_id)}
                  {item.spec_notes && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{item.spec_notes}</Typography>}
                </TableCell>
                <TableCell>{item.quantity}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  ₹{item.unit_price.toFixed(2)}
                  <RateInfo rows={item.price_breakdown} title={`${productName(item.product_id)} x ${item.quantity}`} rate={item.unit_price} amount={item.total_price} />
                </TableCell>
                <TableCell>₹{item.total_price.toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <OrderProduction quotationId={invoice.quotation_id} />

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 5 }}>
          <Paper sx={{ p: 3, borderRadius: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>
              Totals
            </Typography>
            <Stack spacing={0.5}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography color="text.secondary">Subtotal</Typography>
                <Typography>₹{invoice.subtotal.toFixed(2)}</Typography>
              </Box>
              {(invoice.discount_amount ?? 0) > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }} data-testid="invoice-discount">
                  <Typography color="success.main" sx={{ fontWeight: 600 }}>
                    Discount{invoice.discount_type === 'percent' ? ` (${invoice.discount_value}%)` : ''}
                  </Typography>
                  <Typography color="success.main" sx={{ fontWeight: 600 }}>- ₹{(invoice.discount_amount ?? 0).toFixed(2)}</Typography>
                </Box>
              )}
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography color="text.secondary">Tax</Typography>
                <Typography>₹{invoice.tax_amount.toFixed(2)}</Typography>
              </Box>
            </Stack>

            <Box
              sx={{
                mt: 2, mb: 2, py: 2, px: 2.5, borderRadius: 2,
                bgcolor: '#1a237e', color: 'white',
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              }}
            >
              <Typography sx={{ fontWeight: 700, fontSize: '1.1rem' }}>Grand Total</Typography>
              <Typography sx={{ fontWeight: 800, fontSize: '2.25rem', lineHeight: 1 }}>
                ₹{invoice.grand_total.toFixed(2)}
              </Typography>
            </Box>

            <Stack spacing={0.5}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography color="success.main">Paid</Typography>
                <Typography color="success.main">₹{invoice.amount_paid.toFixed(2)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography color={balance > 0 ? 'error.main' : 'text.secondary'} sx={{ fontWeight: balance > 0 ? 700 : 400 }}>
                  Balance Due
                </Typography>
                <Typography color={balance > 0 ? 'error.main' : 'text.secondary'} sx={{ fontWeight: balance > 0 ? 700 : 400 }}>
                  ₹{balance.toFixed(2)}
                </Typography>
              </Box>
            </Stack>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 7 }}>
          <Paper sx={{ p: 3, borderRadius: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                Payments
              </Typography>
              {balance > 0 && (
                <Button size="small" startIcon={<AddIcon />} onClick={() => setPaymentDialogOpen(true)}>
                  Record Payment
                </Button>
              )}
            </Box>
            {balance > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }} data-testid="pay-by-box">
                <TextField
                  size="small" type="date" label="Balance will be paid by" slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'pay-by-date' } }}
                  value={payBy || invoice.pay_by_date || ''} onChange={(e) => setPayBy(e.target.value)}
                />
                <Button size="small" variant="outlined" disabled={payByMutation.isPending || !(payBy || invoice.pay_by_date)} data-testid="pay-by-save"
                  onClick={() => payByMutation.mutate(payBy || invoice.pay_by_date || null)}>
                  Save date
                </Button>
                {invoice.pay_by_date && (
                  <Button size="small" onClick={() => { setPayBy(''); payByMutation.mutate(null); }}>Clear</Button>
                )}
                <Typography variant="caption" color="text.secondary">The Dashboard reminds you when it is due.</Typography>
              </Box>
            )}
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Method</TableCell>
                  <TableCell>Details</TableCell>
                  <TableCell>Amount</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {invoice.payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.payment_date}</TableCell>
                    <TableCell>{p.method.replace('_', ' ')}</TableCell>
                    <TableCell>
                      {[p.upi_id && `UPI ${p.upi_id}`, p.bank_details, p.reference_number].filter(Boolean).join(' · ') || '-'}
                      {p.is_advance && <Chip size="small" label="Advance" sx={{ ml: 0.75 }} />}
                    </TableCell>
                    <TableCell>₹{p.amount.toFixed(2)}</TableCell>
                    <TableCell align="right">
                      {p.has_proof && (
                        <IconButton size="small" aria-label="Open receipt" data-testid="open-receipt" onClick={() => paymentProofApi.open('sale', p.id)}>
                          <AttachFileIcon fontSize="small" />
                        </IconButton>
                      )}
                      <IconButton size="small" onClick={() => setDeletingPaymentId(p.id)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {invoice.payments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ color: 'text.secondary', py: 2 }}>
                      No payments recorded yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Paper>
        </Grid>
      </Grid>

      <Dialog open={paymentDialogOpen} onClose={() => setPaymentDialogOpen(false)} maxWidth="xs" fullWidth>
        <form onSubmit={handleSubmit((data) => paymentMutation.mutate({ ...data, amount: Number(data.amount) }))}>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogContent>
            {paymentMutation.isError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {getErrorMessage(paymentMutation.error, 'Failed to record payment')}
              </Alert>
            )}
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                label="Amount"
                type="number" slotProps={{ htmlInput: { step: 'any' } }}
                fullWidth
                required
                error={Boolean(errors.amount)}
                helperText={errors.amount ? `Enter an amount between ₹0.01 and the balance due (₹${balance.toFixed(2)})` : `Balance due ₹${balance.toFixed(2)}`}
                {...register('amount', { required: true, valueAsNumber: true, min: 0.01, max: Number(balance.toFixed(2)) })}
              />
              <PaymentDetailsFields value={details} onChange={setDetails} idPrefix="inv-pay" />
              <TextField label="Notes" fullWidth multiline rows={2} {...register('notes')} />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setPaymentDialogOpen(false)} disabled={paymentMutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={paymentMutation.isPending}>
              Save
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deletingPaymentId)}
        title="Delete Payment"
        message="Are you sure you want to delete this payment? The invoice balance will be recalculated."
        loading={deletePaymentMutation.isPending}
        onConfirm={() => deletingPaymentId && deletePaymentMutation.mutate(deletingPaymentId)}
        onCancel={() => setDeletingPaymentId(null)}
      />
    </Box>
  );
}
