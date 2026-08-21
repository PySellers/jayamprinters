import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import {
  Box, Typography, Paper, Tabs, Tab, Table, TableHead, TableRow, TableCell, TableBody,
  Button, TextField, MenuItem, Chip, Dialog, DialogTitle, DialogContent, DialogActions,
  Stack, CircularProgress, Alert, Grid,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { cashLedgerApi } from '../api/cashLedgerApi';
import { getErrorMessage } from '../utils/api';
import type { CashTransactionInput, ChequeTransaction, ChequeTransactionInput } from '../types/cashLedger';
import type { CashTxnType, ChequeStatus } from '../types/common';

const TXN_TYPE_LABELS: Record<CashTxnType, string> = {
  receipt: 'Receipt (cash in)', payment: 'Payment (cash out)', bank_deposit: 'Bank Deposit',
};
const CHEQUE_STATUS_COLORS: Record<ChequeStatus, 'default' | 'success' | 'error'> = {
  pending: 'default', cleared: 'success', bounced: 'error',
};

function CashSummaryTab() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const summaryQuery = useQuery({ queryKey: ['cash-ledger', 'summary'], queryFn: cashLedgerApi.summary });

  const { control, register, handleSubmit, reset } = useForm<CashTransactionInput>({
    defaultValues: { txn_type: 'receipt', amount: 0, note: '' },
  });

  const addMutation = useMutation({
    mutationFn: (data: CashTransactionInput) => cashLedgerApi.addTransaction(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-ledger', 'summary'] });
      setDialogOpen(false);
      reset({ txn_type: 'receipt', amount: 0, note: '' });
    },
  });

  if (summaryQuery.isLoading) {
    return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;
  }
  const summary = summaryQuery.data;

  return (
    <>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3, borderRadius: 2, bgcolor: '#e8f5e9' }}>
            <Typography color="text.secondary">Cash in Hand</Typography>
            <Typography variant="h4" sx={{ fontWeight: 'bold' }}>₹{(summary?.cash_in_hand ?? 0).toFixed(2)}</Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3, borderRadius: 2, bgcolor: '#e3f2fd' }}>
            <Typography color="text.secondary">Cash in Bank (deposited)</Typography>
            <Typography variant="h4" sx={{ fontWeight: 'bold' }}>₹{(summary?.cash_in_bank ?? 0).toFixed(2)}</Typography>
          </Paper>
        </Grid>
      </Grid>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Button variant="contained" startIcon={<AddIcon />} sx={{ bgcolor: '#1a237e' }} onClick={() => setDialogOpen(true)}>
          Record Transaction
        </Button>
      </Box>

      <Paper sx={{ borderRadius: 2 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell><TableCell>Type</TableCell><TableCell>Amount</TableCell>
              <TableCell>Note</TableCell><TableCell>By</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(summary?.transactions ?? []).map((t) => (
              <TableRow key={t.id}>
                <TableCell>{new Date(t.created_at).toLocaleDateString()}</TableCell>
                <TableCell>{TXN_TYPE_LABELS[t.txn_type]}</TableCell>
                <TableCell>₹{t.amount.toFixed(2)}</TableCell>
                <TableCell>{t.note || '-'}</TableCell>
                <TableCell>{t.created_by || '-'}</TableCell>
              </TableRow>
            ))}
            {(summary?.transactions ?? []).length === 0 && (
              <TableRow><TableCell colSpan={5} align="center" sx={{ color: 'text.secondary', py: 4 }}>No transactions recorded yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <form onSubmit={handleSubmit((data) => addMutation.mutate({ ...data, amount: Number(data.amount) }))}>
          <DialogTitle>Record Cash Transaction</DialogTitle>
          <DialogContent>
            {addMutation.isError && <Alert severity="error" sx={{ mb: 2 }}>{getErrorMessage(addMutation.error, 'Failed to record transaction')}</Alert>}
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Controller
                name="txn_type"
                control={control}
                render={({ field }) => (
                  <TextField label="Type" select fullWidth {...field}>
                    {(Object.keys(TXN_TYPE_LABELS) as CashTxnType[]).map((t) => (
                      <MenuItem key={t} value={t}>{TXN_TYPE_LABELS[t]}</MenuItem>
                    ))}
                  </TextField>
                )}
              />
              <TextField label="Amount" type="number" required fullWidth {...register('amount', { required: true, valueAsNumber: true, min: 0.01 })} />
              <TextField label="Note" fullWidth multiline rows={2} {...register('note')} />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)} disabled={addMutation.isPending}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={addMutation.isPending}>Save</Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}

function ChequesTab() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const listQuery = useQuery({ queryKey: ['cheques'], queryFn: cashLedgerApi.listCheques });

  const { control, register, handleSubmit, reset } = useForm<ChequeTransactionInput>({
    defaultValues: { direction: 'deposited', cheque_no: '', amount: 0, party_name: '', bank_branch: '' },
  });

  const addMutation = useMutation({
    mutationFn: (data: ChequeTransactionInput) => cashLedgerApi.addCheque(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cheques'] });
      setDialogOpen(false);
      reset({ direction: 'deposited', cheque_no: '', amount: 0, party_name: '', bank_branch: '' });
    },
  });

  const statusMutation = useMutation({
    mutationFn: (vars: { id: number; status: ChequeStatus }) => cashLedgerApi.updateChequeStatus(vars.id, vars.status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cheques'] }),
  });

  const rows = listQuery.data ?? [];

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Button variant="contained" startIcon={<AddIcon />} sx={{ bgcolor: '#1a237e' }} onClick={() => setDialogOpen(true)}>
          Add Cheque
        </Button>
      </Box>
      <Paper sx={{ borderRadius: 2 }}>
        {listQuery.isLoading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Cheque No.</TableCell><TableCell>Direction</TableCell><TableCell>Party</TableCell>
                <TableCell>Amount</TableCell><TableCell>Cheque Date</TableCell><TableCell>Bank/Branch</TableCell>
                <TableCell>Deposit Date</TableCell><TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((c: ChequeTransaction) => (
                <TableRow key={c.id}>
                  <TableCell>{c.cheque_no}</TableCell>
                  <TableCell>{c.direction === 'issued' ? 'Issued' : 'Deposited'}</TableCell>
                  <TableCell>{c.party_name || '-'}</TableCell>
                  <TableCell>₹{c.amount.toFixed(2)}</TableCell>
                  <TableCell>{c.cheque_date || '-'}</TableCell>
                  <TableCell>{c.bank_branch || '-'}</TableCell>
                  <TableCell>{c.deposit_date || '-'}</TableCell>
                  <TableCell>
                    <TextField
                      select size="small" value={c.status}
                      onChange={(e) => statusMutation.mutate({ id: c.id, status: e.target.value as ChequeStatus })}
                      sx={{ minWidth: 120 }}
                    >
                      <MenuItem value="pending">Pending</MenuItem>
                      <MenuItem value="cleared">Cleared</MenuItem>
                      <MenuItem value="bounced">Bounced</MenuItem>
                    </TextField>
                    {' '}
                    <Chip label={c.status} color={CHEQUE_STATUS_COLORS[c.status]} size="small" sx={{ ml: 1 }} />
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={8} align="center" sx={{ color: 'text.secondary', py: 4 }}>No cheques recorded yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <form
          onSubmit={handleSubmit((data) =>
            // Unfilled <input type="date"> fields register as "" — the backend
            // rejects "" as an invalid date, and these two are optional (a cheque
            // may not have a deposit date yet).
            addMutation.mutate({
              ...data,
              amount: Number(data.amount),
              cheque_date: data.cheque_date || undefined,
              deposit_date: data.deposit_date || undefined,
            })
          )}
        >
          <DialogTitle>Add Cheque</DialogTitle>
          <DialogContent>
            {addMutation.isError && <Alert severity="error" sx={{ mb: 2 }}>{getErrorMessage(addMutation.error, 'Failed to save cheque')}</Alert>}
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Controller
                name="direction"
                control={control}
                render={({ field }) => (
                  <TextField label="Direction" select fullWidth {...field}>
                    <MenuItem value="deposited">Deposited (received from a customer)</MenuItem>
                    <MenuItem value="issued">Issued (paid to a vendor)</MenuItem>
                  </TextField>
                )}
              />
              <TextField label="Cheque No." required fullWidth {...register('cheque_no', { required: true })} />
              <TextField label="Party Name" fullWidth {...register('party_name')} />
              <TextField label="Amount" type="number" required fullWidth {...register('amount', { required: true, valueAsNumber: true, min: 0.01 })} />
              <TextField label="Cheque Date" type="date" fullWidth slotProps={{ inputLabel: { shrink: true } }} {...register('cheque_date')} />
              <TextField label="Bank / Branch" fullWidth {...register('bank_branch')} />
              <TextField label="Deposit Date" type="date" fullWidth slotProps={{ inputLabel: { shrink: true } }} {...register('deposit_date')} />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)} disabled={addMutation.isPending}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={addMutation.isPending}>Save</Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}

export default function CashLedger() {
  const [tab, setTab] = useState(0);
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 2 }}>Cash Ledger</Typography>
      <Paper sx={{ borderRadius: 2, mb: 3 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label="Cash Summary" />
          <Tab label="Cheques" />
        </Tabs>
      </Paper>
      {tab === 0 && <CashSummaryTab />}
      {tab === 1 && <ChequesTab />}
    </Box>
  );
}
