import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Chip, Stack, Typography } from '@mui/material';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import { invoicesApi } from '../../api/invoicesApi';
import { inventoryApi } from '../../api/inventoryApi';
import { useAuth } from '../../context/AuthContext';
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
  const { user } = useAuth();
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
    </Stack>
  );
}
