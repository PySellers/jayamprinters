import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Box, Chip, CircularProgress, Link, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { customersApi } from '../../api/customersApi';

const money = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (d?: string | null) => (d ? new Date(`${d}T00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '-');

/**
 * The customer's earlier orders, one line each (date, bill, what they ordered, quantity, amount, paid, balance), with a short
 * summary - shown under the Generate button so a regular customer can be given a better discount.
 */
export default function CustomerHistoryPanel({ customerId }: { customerId: number | null | undefined }) {
  const navigate = useNavigate();
  const history = useQuery({
    queryKey: ['customer-orders', customerId],
    queryFn: () => customersApi.orders(customerId!),
    enabled: Boolean(customerId),
  });
  if (!customerId) return null;
  const h = history.data;
  return (
    <Paper variant="outlined" sx={{ p: 2, mt: 3, borderRadius: 2 }} data-testid="customer-history">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#1a237e' }}>Earlier orders of this customer</Typography>
        {h && <Chip size="small" color={h.orders >= 4 ? 'success' : 'default'} label={h.tag} data-testid="history-tag" />}
      </Box>
      {history.isLoading && <CircularProgress size={20} />}
      {h && (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }} data-testid="history-summary">
            {h.orders} order{h.orders === 1 ? '' : 's'} so far ({h.orders_last_180_days} in the last 6 months) · billed ₹{money(h.total_billed)} in all
            {h.orders > 0 ? ` · average ₹${money(h.average_order)}` : ''} · discount given so far ₹{money(h.discount_given)}
            {h.balance_due > 0 ? ` · still owes ₹${money(h.balance_due)}` : ''}
          </Typography>
          {h.rows.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No earlier orders - this is the first one.</Typography>
          ) : (
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" data-testid="history-table">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell><TableCell>Bill</TableCell><TableCell>Order</TableCell>
                    <TableCell align="right">Qty</TableCell><TableCell align="right">Amount</TableCell>
                    <TableCell align="right">Discount</TableCell><TableCell align="right">Balance</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {h.rows.map((r) => (
                    <TableRow key={r.invoice_id} hover data-testid="history-row">
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{day(r.date)}</TableCell>
                      <TableCell><Link component="button" type="button" onClick={() => navigate(`/invoices/${r.invoice_id}`)}>{r.bill_no ?? r.invoice_number}</Link></TableCell>
                      <TableCell sx={{ maxWidth: 360 }}>{r.name}{r.lines > 1 ? ` (${r.lines} items)` : ''}</TableCell>
                      <TableCell align="right">{r.quantity.toLocaleString('en-IN')}</TableCell>
                      <TableCell align="right">₹{money(r.amount)}</TableCell>
                      <TableCell align="right">{r.discount > 0 ? `₹${money(r.discount)}` : '-'}</TableCell>
                      <TableCell align="right" sx={{ color: r.balance > 0 ? 'error.main' : 'text.secondary', fontWeight: r.balance > 0 ? 700 : 400 }}>{r.balance > 0 ? `₹${money(r.balance)}` : 'Paid'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </>
      )}
    </Paper>
  );
}
