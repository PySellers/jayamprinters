import { useQuery } from '@tanstack/react-query';
import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody,
  CircularProgress, Chip, Grid,
} from '@mui/material';
import { cashLedgerApi } from '../api/cashLedgerApi';
import EmptyState from '../components/EmptyState';
import type { ChequeStatus } from '../types/common';

const CHEQUE_STATUS_COLORS: Record<ChequeStatus, 'default' | 'info' | 'success' | 'error'> = {
  pending: 'default',
  deposited: 'info',
  cleared: 'success',
  bounced: 'error',
};

export default function CashLedger() {
  const summaryQuery = useQuery({ queryKey: ['cash-ledger', 'summary'], queryFn: cashLedgerApi.summary });
  const chequesQuery = useQuery({ queryKey: ['cash-ledger', 'cheques'], queryFn: cashLedgerApi.cheques });

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 3 }}>
        Cash Ledger
      </Typography>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <Paper sx={{ p: 3, borderRadius: 2, borderTop: '4px solid #2e7d32' }}>
            <Typography color="text.secondary" variant="body2">Cash in Hand</Typography>
            <Typography variant="h3" sx={{ fontWeight: 'bold' }} color="#2e7d32">
              ₹{(summaryQuery.data?.cash_in_hand ?? 0).toFixed(2)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Received ₹{(summaryQuery.data?.cash_received ?? 0).toFixed(2)} · Paid out ₹{(summaryQuery.data?.cash_paid_out ?? 0).toFixed(2)}
            </Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <Paper sx={{ p: 3, borderRadius: 2, borderTop: '4px solid #1565c0' }}>
            <Typography color="text.secondary" variant="body2">Cash in Bank</Typography>
            <Typography variant="h3" sx={{ fontWeight: 'bold' }} color="#1565c0">
              ₹{(summaryQuery.data?.cash_in_bank ?? 0).toFixed(2)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Received ₹{(summaryQuery.data?.bank_received ?? 0).toFixed(2)} · Paid out ₹{(summaryQuery.data?.bank_paid_out ?? 0).toFixed(2)}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              (UPI, card, bank transfer, and cheque payments)
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      <Paper sx={{ borderRadius: 2, overflowX: 'auto' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 'bold', p: 2, pb: 0 }}>
          Cheques
        </Typography>
        {chequesQuery.isLoading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <CircularProgress />
          </Box>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Direction</TableCell>
                <TableCell>Cheque #</TableCell>
                <TableCell>Branch</TableCell>
                <TableCell>Cheque Date</TableCell>
                <TableCell>Deposit Date</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Amount</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(chequesQuery.data ?? []).map((c) => (
                <TableRow key={`${c.direction}-${c.id}`}>
                  <TableCell>{c.payment_date}</TableCell>
                  <TableCell>
                    <Chip label={c.direction === 'received' ? 'Received' : 'Issued'} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>{c.cheque_number || '-'}</TableCell>
                  <TableCell>{c.issued_branch || '-'}</TableCell>
                  <TableCell>{c.cheque_date || '-'}</TableCell>
                  <TableCell>{c.cheque_deposit_date || '-'}</TableCell>
                  <TableCell>
                    {c.cheque_status && (
                      <Chip label={c.cheque_status} size="small" color={CHEQUE_STATUS_COLORS[c.cheque_status]} />
                    )}
                  </TableCell>
                  <TableCell>₹{c.amount.toFixed(2)}</TableCell>
                </TableRow>
              ))}
              {(chequesQuery.data ?? []).length === 0 && <EmptyState colSpan={8} message="No cheques recorded yet." />}
            </TableBody>
          </Table>
        )}
      </Paper>
    </Box>
  );
}
