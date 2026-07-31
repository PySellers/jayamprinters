import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody,
  Button, IconButton, Chip, CircularProgress, Grid, Stack, Divider,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { purchasesApi, vendorsApi, inventoryItemsApi } from '../api/purchasesApi';
import { getErrorMessage } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useNotify } from '../context/NotificationContext';
import type { PurchasePaymentInput } from '../types/purchases';
import type { ChequeStatus, PaymentMethod } from '../types/common';
import ConfirmDialog from '../components/ConfirmDialog';

const STATUS_COLORS: Record<string, 'default' | 'warning' | 'success'> = {
  unpaid: 'default',
  partially_paid: 'warning',
  paid: 'success',
};
const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'upi', 'card', 'credit', 'bank_transfer', 'cheque'];
const CHEQUE_STATUSES: ChequeStatus[] = ['pending', 'deposited', 'cleared', 'bounced'];

export default function PurchaseDetail() {
  const { id } = useParams<{ id: string }>();
  const purchaseId = Number(id);
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const canManagePayments = hasRole('admin', 'accounts');
  const notify = useNotify();
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = useState<number | null>(null);

  const purchaseQuery = useQuery({ queryKey: ['purchases', purchaseId], queryFn: () => purchasesApi.get(purchaseId) });
  const vendorsQuery = useQuery({ queryKey: ['vendors'], queryFn: vendorsApi.list });
  const inventoryQuery = useQuery({ queryKey: ['inventory-items'], queryFn: inventoryItemsApi.list });

  const itemName = (id: number) => inventoryQuery.data?.find((i) => i.id === id)?.name ?? `#${id}`;

  const { control, register, handleSubmit, reset, watch, formState: { errors } } = useForm<PurchasePaymentInput>({
    defaultValues: { amount: 0, method: 'cash', reference_number: '', notes: '' },
  });
  const paymentMethod = watch('method');

  const paymentMutation = useMutation({
    mutationFn: (data: PurchasePaymentInput) => purchasesApi.addPayment(purchaseId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases', purchaseId] });
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      notify('Payment recorded');
      setPaymentDialogOpen(false);
      reset({ amount: 0, method: 'cash', reference_number: '', notes: '' });
    },
  });

  const deletePaymentMutation = useMutation({
    mutationFn: (paymentId: number) => purchasesApi.removePayment(paymentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases', purchaseId] });
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      notify('Payment deleted');
      setDeletingPaymentId(null);
    },
    onError: (error) => {
      notify(getErrorMessage(error, 'Failed to delete payment'), 'error');
      setDeletingPaymentId(null);
    },
  });

  if (purchaseQuery.isLoading) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  const purchase = purchaseQuery.data;
  if (!purchase) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="error">Purchase not found.</Typography>
      </Box>
    );
  }

  const balance = purchase.grand_total - purchase.amount_paid;

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
            {purchase.purchase_number}
          </Typography>
          <Typography color="text.secondary">
            {vendorsQuery.data?.find((v) => v.id === purchase.vendor_id)?.name ?? `Vendor #${purchase.vendor_id}`}
          </Typography>
        </Box>
        <Chip label={purchase.status.replace('_', ' ')} color={STATUS_COLORS[purchase.status]} />
      </Box>

      <Paper sx={{ borderRadius: 2, mb: 3, overflowX: 'auto' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Item</TableCell>
              <TableCell>Quantity</TableCell>
              <TableCell>Unit Price</TableCell>
              <TableCell>Total</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {purchase.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{itemName(item.inventory_item_id)}</TableCell>
                <TableCell>{item.quantity}</TableCell>
                <TableCell>₹{item.unit_price.toFixed(2)}</TableCell>
                <TableCell>₹{item.total_price.toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 5 }}>
          <Paper sx={{ p: 3, borderRadius: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>
              Totals
            </Typography>
            <Stack spacing={0.5}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography color="text.secondary">Subtotal</Typography>
                <Typography>₹{purchase.subtotal.toFixed(2)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography color="text.secondary">Tax</Typography>
                <Typography>₹{purchase.tax_amount.toFixed(2)}</Typography>
              </Box>
              <Divider sx={{ my: 1 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography sx={{ fontWeight: 'bold' }}>Grand Total</Typography>
                <Typography sx={{ fontWeight: 'bold' }}>₹{purchase.grand_total.toFixed(2)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography color="success.main">Paid</Typography>
                <Typography color="success.main">₹{purchase.amount_paid.toFixed(2)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography color={balance > 0 ? 'error.main' : 'text.secondary'}>Balance</Typography>
                <Typography color={balance > 0 ? 'error.main' : 'text.secondary'}>₹{balance.toFixed(2)}</Typography>
              </Box>
            </Stack>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 7 }}>
          <Paper sx={{ p: 3, borderRadius: 2, overflowX: 'auto' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                Payments
              </Typography>
              {balance > 0 && canManagePayments && (
                <Button size="small" startIcon={<AddIcon />} onClick={() => setPaymentDialogOpen(true)}>
                  Record Payment
                </Button>
              )}
            </Box>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Method</TableCell>
                  <TableCell>Reference</TableCell>
                  <TableCell>Amount</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {purchase.payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.payment_date}</TableCell>
                    <TableCell>
                      {p.method.replace('_', ' ')}
                      {p.method === 'cheque' && p.cheque_number && ` (#${p.cheque_number}, ${p.cheque_status})`}
                    </TableCell>
                    <TableCell>{p.reference_number || '-'}</TableCell>
                    <TableCell>₹{p.amount.toFixed(2)}</TableCell>
                    <TableCell align="right">
                      {canManagePayments && (
                        <IconButton size="small" onClick={() => setDeletingPaymentId(p.id)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {purchase.payments.length === 0 && (
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
                type="number"
                fullWidth
                required
                error={Boolean(errors.amount)}
                {...register('amount', { required: true, valueAsNumber: true, min: 0.01, max: balance })}
              />
              <Controller
                name="method"
                control={control}
                render={({ field }) => (
                  <TextField label="Method" select fullWidth {...field}>
                    {PAYMENT_METHODS.map((m) => (
                      <MenuItem key={m} value={m}>
                        {m.replace('_', ' ')}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
              />
              <TextField label="Reference Number" fullWidth {...register('reference_number')} />
              {paymentMethod === 'cheque' && (
                <>
                  <TextField label="Cheque Number" fullWidth {...register('cheque_number')} />
                  <TextField
                    label="Cheque Date"
                    type="date"
                    fullWidth
                    slotProps={{ inputLabel: { shrink: true } }}
                    {...register('cheque_date')}
                  />
                  <TextField label="Issued Branch" fullWidth {...register('issued_branch')} />
                  <Controller
                    name="cheque_status"
                    control={control}
                    render={({ field }) => (
                      <TextField label="Cheque Status" select fullWidth value={field.value ?? 'pending'} onChange={field.onChange}>
                        {CHEQUE_STATUSES.map((s) => (
                          <MenuItem key={s} value={s}>{s}</MenuItem>
                        ))}
                      </TextField>
                    )}
                  />
                </>
              )}
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
        message="Are you sure you want to delete this payment? The purchase balance will be recalculated."
        loading={deletePaymentMutation.isPending}
        onConfirm={() => deletingPaymentId && deletePaymentMutation.mutate(deletingPaymentId)}
        onCancel={() => setDeletingPaymentId(null)}
      />
    </Box>
  );
}
