import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment, Stack, TextField, Typography,
} from '@mui/material';
import PaymentsIcon from '@mui/icons-material/Payments';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import { invoicesApi } from '../../api/invoicesApi';
import { inventoryApi } from '../../api/inventoryApi';
import { paymentProofApi } from '../../api/extraApi';
import { getErrorMessage } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import PaymentDetailsFields, { detailsPayload, emptyPaymentDetails, type PaymentDetails } from '../PaymentDetailsFields';
import type { DueRow } from '../../types/invoices';

const money = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d: string) => new Date(`${d}T00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

/** A ready WhatsApp message to the customer with the remaining amount and the promised day. */
export function reminderLink(row: DueRow): string {
  const digits = (row.phone ?? '').replace(/\D/g, '');
  const number = digits.length === 10 ? `91${digits}` : digits;
  const text =
    `Dear ${row.customer_name}, this is a reminder from Sri Jayam Printers. ` +
    `The balance of ${money(row.balance)} for bill ${row.bill_no ?? row.invoice_number} is due${row.days_left < 0 ? ' (it was due on ' : ' on '}${day(row.pay_by_date)}${row.days_left < 0 ? ')' : ''}. ` +
    `Kindly pay at the earliest. Thank you.`;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

/**
 * Two things the counter must not forget, shown above the order form: customers whose promised payment day is here (with a
 * Remind button that opens a ready WhatsApp message with the remaining amount), and stock that is low or finished.
 */
export default function DashboardAlerts() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  // Record the money a customer paid straight from the Payments due list: the balance, the overdue mark and the list update at once
  const [paying, setPaying] = useState<DueRow | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payDetails, setPayDetails] = useState<PaymentDetails>(emptyPaymentDetails());
  const [nextDate, setNextDate] = useState('');
  const payMutation = useMutation({
    mutationFn: async () => {
      const amount = Number(payAmount);
      const before = new Set((await invoicesApi.get(paying!.invoice_id)).payments.map((p) => p.id));
      const updated = await invoicesApi.addPayment(paying!.invoice_id, { amount, ...detailsPayload(payDetails) });
      const created = updated.payments.find((p) => !before.has(p.id));
      if (created && payDetails.file) await paymentProofApi.upload('sale', created.id, payDetails.file);
      // part payment: the customer promises the rest for a new day (blank = keep the old promise)
      if (nextDate && amount < paying!.balance - 0.004) await invoicesApi.setPayBy(paying!.invoice_id, nextDate);
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice-dues'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setPaying(null);
    },
  });
  const openPay = (row: DueRow) => {
    setPaying(row);
    setPayAmount(String(row.balance));
    setPayDetails(emptyPaymentDetails());
    setNextDate('');
    payMutation.reset();
  };
  const payNumber = Number(payAmount);
  const payError = !(payNumber > 0) ? 'Enter the amount received' : paying && payNumber > paying.balance + 0.004 ? `More than the balance (${money(paying.balance)})` : '';
  const dues = useQuery({ queryKey: ['invoice-dues'], queryFn: () => invoicesApi.dues(7), refetchInterval: 60000 });
  const low = useQuery({ queryKey: ['low-stock'], queryFn: inventoryApi.lowStock, refetchInterval: 120000 });
  const due = (dues.data ?? []).filter((r) => r.state !== 'upcoming');
  const soon = (dues.data ?? []).filter((r) => r.state === 'upcoming');
  const lowItems = low.data ?? [];
  if (due.length === 0 && soon.length === 0 && lowItems.length === 0) return null;
  const canSeeStock = user?.role !== 'production';

  return (
    <Stack spacing={1} sx={{ mb: 1.75 }} data-testid="dashboard-alerts">
      {(due.length > 0 || soon.length > 0) && (
        <Alert severity={due.length ? 'error' : 'info'} icon={false} sx={{ alignItems: 'flex-start' }} data-testid="payments-due">
          <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5 }}>
            Payments due{due.length ? ` - ${due.length} to collect now` : ''}
          </Typography>
          <Stack spacing={0.5}>
            {[...due, ...soon].map((r) => (
              <Box key={r.invoice_id} sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }} data-testid="due-row">
                <Chip size="small" color={r.state === 'overdue' ? 'error' : r.state === 'today' ? 'warning' : 'default'}
                  label={r.state === 'overdue' ? `Overdue ${-r.days_left}d` : r.state === 'today' ? 'Due today' : `Due ${day(r.pay_by_date)}`} />
                <Typography variant="body2"><b>{r.customer_name}</b> · bill {r.bill_no ?? r.invoice_number} · balance <b>{money(r.balance)}</b></Typography>
                <Button size="small" startIcon={<WhatsAppIcon />} disabled={!r.phone} href={reminderLink(r)} target="_blank" rel="noopener" data-testid="remind">
                  Remind
                </Button>
                <Button size="small" variant="contained" color="success" startIcon={<PaymentsIcon />} onClick={() => openPay(r)} data-testid="due-pay">Record payment</Button>
                <Button size="small" onClick={() => navigate(`/invoices/${r.invoice_id}`)}>Open</Button>
              </Box>
            ))}
          </Stack>
        </Alert>
      )}
      {lowItems.length > 0 && canSeeStock && (
        <Alert severity="warning" icon={false} data-testid="stock-low" action={<Button size="small" onClick={() => navigate('/inventory')}>Open stock</Button>}>
          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Stock to buy</Typography>
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 0.5 }}>
            {lowItems.slice(0, 12).map((i) => (
              <Chip key={i.id} size="small" color={i.stock_state === 'empty' ? 'error' : 'warning'} variant="outlined"
                label={`${i.name}: ${i.stock_state === 'empty' ? 'EMPTY' : `${i.current_qty} ${i.unit} left`}`} />
            ))}
            {lowItems.length > 12 && <Chip size="small" label={`+${lowItems.length - 12} more`} />}
          </Box>
        </Alert>
      )}
      <Dialog open={Boolean(paying)} onClose={() => !payMutation.isPending && setPaying(null)} maxWidth="xs" fullWidth data-testid="due-pay-dialog">
        <DialogTitle>Payment from {paying?.customer_name}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Bill {paying?.bill_no ?? paying?.invoice_number} · balance due <b>{paying ? money(paying.balance) : ''}</b>
            {paying && paying.days_left < 0 ? ` · overdue by ${-paying.days_left} day(s)` : ''}
          </Typography>
          {payMutation.isError && <Alert severity="error" sx={{ mb: 2 }}>{getErrorMessage(payMutation.error, 'Could not record the payment')}</Alert>}
          <Stack spacing={2}>
            <TextField
              autoFocus label="Amount received" type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} error={Boolean(payError)} helperText={payError || 'The full balance by default; change it for a part payment'}
              slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> }, htmlInput: { min: 0, step: 'any', 'data-testid': 'due-pay-amount' } }}
            />
            <PaymentDetailsFields value={payDetails} onChange={setPayDetails} idPrefix="due-pay" />
            {paying && payNumber > 0 && payNumber < paying.balance - 0.004 && (
              <TextField
                type="date" label="Rest will be paid by (optional)" value={nextDate} onChange={(e) => setNextDate(e.target.value)}
                helperText="Blank keeps the old promised day (the customer stays on this list until the balance is paid)"
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'due-pay-next' } }}
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPaying(null)} disabled={payMutation.isPending}>Cancel</Button>
          <Button variant="contained" color="success" disabled={Boolean(payError) || payMutation.isPending} onClick={() => payMutation.mutate()} data-testid="due-pay-save">
            {payMutation.isPending ? 'Saving...' : 'Save payment'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
