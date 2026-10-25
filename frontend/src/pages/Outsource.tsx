import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Autocomplete, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Grid,
  IconButton, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PaymentsIcon from '@mui/icons-material/Payments';
import { outsourceApi } from '../api/outsourceApi';
import { vendorsApi } from '../api/vendorsApi';
import { customersApi } from '../api/customersApi';
import { getErrorMessage } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import ConfirmDialog from '../components/ConfirmDialog';
import type { OutsourceJob, OutsourceStatus } from '../types/outsource';

const STATUSES: { value: OutsourceStatus; label: string; color: 'default' | 'info' | 'warning' | 'success' | 'error' }[] = [
  { value: 'sent', label: 'Sent out', color: 'info' },
  { value: 'in_progress', label: 'In progress', color: 'warning' },
  { value: 'received', label: 'Received', color: 'success' },
  { value: 'delivered', label: 'Delivered to customer', color: 'success' },
  { value: 'cancelled', label: 'Cancelled', color: 'default' },
];
const money = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MONEY_PROPS = { htmlInput: { step: 'any', min: 0 } } as const;

interface FormState {
  company: string;
  customerId: number | '';
  service: string;
  description: string;
  size: string;
  quantity: string;
  sentDate: string;
  expectedDate: string;
  status: OutsourceStatus;
  cost: string;
  price: string;
  notes: string;
}
const today = () => new Date().toISOString().slice(0, 10);
const blank = (): FormState => ({
  company: '', customerId: '', service: '', description: '', size: '', quantity: '1', sentDate: today(), expectedDate: '',
  status: 'sent', cost: '', price: '', notes: '',
});

/**
 * Work the shop sends to an outside company (very large stickers, special finishing...) and hands back to its own customer:
 * who it went to, how many, what it cost us and what we bill, so the margin on every outsourced job is known.
 */
export default function Outsource() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<OutsourceJob | null>(null);
  const [form, setForm] = useState<FormState>(blank());
  const [paying, setPaying] = useState<OutsourceJob | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [deleting, setDeleting] = useState<OutsourceJob | null>(null);
  const [filter, setFilter] = useState<'all' | 'open' | 'unpaid'>('all');

  const jobsQuery = useQuery({ queryKey: ['outsource'], queryFn: outsourceApi.list });
  const vendorsQuery = useQuery({ queryKey: ['vendors'], queryFn: vendorsApi.list });
  const customersQuery = useQuery({ queryKey: ['customers'], queryFn: customersApi.list });
  const vendors = vendorsQuery.data ?? [];
  const customers = customersQuery.data ?? [];
  const customerName = (id?: number | null) => customers.find((c) => c.id === id)?.name ?? '';

  const rows = useMemo(() => {
    const all = jobsQuery.data ?? [];
    if (filter === 'open') return all.filter((j) => j.status === 'sent' || j.status === 'in_progress');
    if (filter === 'unpaid') return all.filter((j) => j.balance_to_pay > 0 && j.status !== 'cancelled');
    return all;
  }, [jobsQuery.data, filter]);
  const totals = useMemo(() => {
    const live = (jobsQuery.data ?? []).filter((j) => j.status !== 'cancelled');
    return {
      cost: live.reduce((s, j) => s + j.cost_amount, 0),
      price: live.reduce((s, j) => s + j.customer_price, 0),
      owed: live.reduce((s, j) => s + j.balance_to_pay, 0),
    };
  }, [jobsQuery.data]);

  const save = useMutation({
    mutationFn: () => {
      const vendor = vendors.find((v) => v.name.toLowerCase() === form.company.trim().toLowerCase());
      const payload = {
        vendor_id: vendor?.id ?? null,
        vendor_name: vendor ? null : form.company.trim() || null,
        customer_id: form.customerId === '' ? null : form.customerId,
        service: form.service.trim(),
        description: form.description.trim() || null,
        size: form.size.trim() || null,
        quantity: Math.max(1, Math.round(Number(form.quantity) || 1)),
        sent_date: form.sentDate || null,
        expected_date: form.expectedDate || null,
        status: form.status,
        cost_amount: Number(form.cost) || 0,
        customer_price: Number(form.price) || 0,
        notes: form.notes.trim() || null,
      };
      return editing ? outsourceApi.update(editing.id, payload) : outsourceApi.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outsource'] });
      setDialogOpen(false);
    },
  });
  const changeStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: OutsourceStatus }) => outsourceApi.update(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['outsource'] }),
  });
  const pay = useMutation({
    mutationFn: () => outsourceApi.pay(paying!.id, Number(payAmount)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outsource'] });
      setPaying(null);
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => outsourceApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outsource'] });
      setDeleting(null);
    },
  });

  const openCreate = () => {
    setEditing(null);
    save.reset();
    setForm(blank());
    setDialogOpen(true);
  };
  const openEdit = (j: OutsourceJob) => {
    setEditing(j);
    save.reset();
    setForm({
      company: j.vendor_name ?? '', customerId: j.customer_id ?? '', service: j.service, description: j.description ?? '', size: j.size ?? '',
      quantity: String(j.quantity), sentDate: j.sent_date ?? '', expectedDate: j.expected_date ?? '', status: j.status,
      cost: String(j.cost_amount), price: String(j.customer_price), notes: j.notes ?? '',
    });
    setDialogOpen(true);
  };
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const canSave = form.company.trim() !== '' && form.service.trim() !== '';

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>Outsource</Typography>
        <Button variant="contained" startIcon={<AddIcon />} sx={{ bgcolor: '#1a237e' }} onClick={openCreate}>New Outsource Job</Button>
      </Box>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Work sent to an outside company and handed back to our customer — what it costs us, what we bill, and the margin.
      </Typography>

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
        {[['Outside cost', money(totals.cost)], ['Billed to customers', money(totals.price)], ['Margin', money(totals.price - totals.cost)], ['Still to pay outside', money(totals.owed)]].map(([k, v]) => (
          <Paper key={k} variant="outlined" sx={{ px: 2, py: 1, borderRadius: 2, minWidth: 170 }}>
            <Typography variant="caption" color="text.secondary">{k}</Typography>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>{v}</Typography>
          </Paper>
        ))}
        <Box sx={{ ml: 'auto', display: 'flex', gap: 1, alignItems: 'center' }}>
          {([['all', 'All'], ['open', 'Out with the press'], ['unpaid', 'Unpaid to press']] as const).map(([k, label]) => (
            <Chip key={k} label={label} color={filter === k ? 'primary' : 'default'} onClick={() => setFilter(k)} />
          ))}
        </Box>
      </Box>

      <Paper sx={{ borderRadius: 2, overflowX: 'auto' }}>
        {jobsQuery.isLoading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>
        ) : (
          <Table size="small" sx={{ '& th, & td': { px: 1.25, py: 1.25 } }}>
            <TableHead>
              <TableRow>
                <TableCell>Job #</TableCell>
                <TableCell>Outside company</TableCell>
                <TableCell>Work</TableCell>
                <TableCell>Customer</TableCell>
                <TableCell align="right">Qty</TableCell>
                <TableCell>Sent / expected</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Cost</TableCell>
                <TableCell align="right">Billed</TableCell>
                <TableCell align="right">Margin</TableCell>
                <TableCell align="right">To pay</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((j) => (
                <TableRow key={j.id} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{j.job_number}</TableCell>
                  <TableCell>{j.vendor_name}</TableCell>
                  <TableCell>
                    {j.service}
                    {(j.size || j.description) && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{[j.size, j.description].filter(Boolean).join(' · ')}</Typography>}
                  </TableCell>
                  <TableCell>{customerName(j.customer_id)}</TableCell>
                  <TableCell align="right">{j.quantity}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{j.sent_date ?? '—'}{j.expected_date ? ` → ${j.expected_date}` : ''}</TableCell>
                  <TableCell>
                    <TextField select size="small" variant="standard" value={j.status} onChange={(e) => changeStatus.mutate({ id: j.id, status: e.target.value as OutsourceStatus })} sx={{ minWidth: 150 }}>
                      {STATUSES.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
                    </TextField>
                  </TableCell>
                  <TableCell align="right">{money(j.cost_amount)}</TableCell>
                  <TableCell align="right">{money(j.customer_price)}</TableCell>
                  <TableCell align="right" sx={{ color: j.margin < 0 ? 'error.main' : 'success.main', fontWeight: 700 }}>{money(j.margin)}</TableCell>
                  <TableCell align="right">{j.balance_to_pay > 0 ? <strong>{money(j.balance_to_pay)}</strong> : <Chip size="small" color="success" label="Paid" />}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    {j.balance_to_pay > 0 && <IconButton size="small" aria-label="Pay outside company" onClick={() => { setPaying(j); setPayAmount(String(j.balance_to_pay)); pay.reset(); }}><PaymentsIcon fontSize="small" /></IconButton>}
                    <IconButton size="small" aria-label="Edit" onClick={() => openEdit(j)}><EditIcon fontSize="small" /></IconButton>
                    {isAdmin && <IconButton size="small" aria-label="Delete" onClick={() => setDeleting(j)}><DeleteIcon fontSize="small" /></IconButton>}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && <TableRow><TableCell colSpan={12} align="center" sx={{ py: 4, color: 'text.secondary' }}>No outsourced work yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        )}
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editing ? `Edit ${editing.job_number}` : 'New Outsource Job'}</DialogTitle>
        <DialogContent>
          {save.isError && <Alert severity="error" sx={{ mb: 2 }}>{getErrorMessage(save.error, 'Could not save')}</Alert>}
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Autocomplete
                freeSolo
                options={vendors.map((v) => v.name)}
                inputValue={form.company}
                onInputChange={(_, value) => set('company', value)}
                renderInput={(params) => <TextField {...params} label="Outside company" required helperText="Pick a vendor or type a new name" />}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField select fullWidth label="For customer (optional)" value={form.customerId} onChange={(e) => set('customerId', e.target.value === '' ? '' : Number(e.target.value))}>
                <MenuItem value="">— none —</MenuItem>
                {customers.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth required label="Work / service sent out" placeholder="e.g. Large vinyl stickers" value={form.service} onChange={(e) => set('service', e.target.value)} /></Grid>
            <Grid size={{ xs: 12, sm: 3 }}><TextField fullWidth label="Size" value={form.size} onChange={(e) => set('size', e.target.value)} /></Grid>
            <Grid size={{ xs: 12, sm: 3 }}><TextField fullWidth label="Copies / quantity" type="number" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} slotProps={{ htmlInput: { min: 1, step: 1 } }} /></Grid>
            <Grid size={{ xs: 12 }}><TextField fullWidth label="Details" multiline minRows={2} value={form.description} onChange={(e) => set('description', e.target.value)} /></Grid>
            <Grid size={{ xs: 12, sm: 4 }}><TextField fullWidth label="Sent on" type="date" value={form.sentDate} onChange={(e) => set('sentDate', e.target.value)} slotProps={{ inputLabel: { shrink: true } }} /></Grid>
            <Grid size={{ xs: 12, sm: 4 }}><TextField fullWidth label="Expected back" type="date" value={form.expectedDate} onChange={(e) => set('expectedDate', e.target.value)} slotProps={{ inputLabel: { shrink: true } }} /></Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField select fullWidth label="Status" value={form.status} onChange={(e) => set('status', e.target.value as OutsourceStatus)}>
                {STATUSES.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}><TextField fullWidth label="Cost (paid to outside company)" type="number" value={form.cost} onChange={(e) => set('cost', e.target.value)} slotProps={MONEY_PROPS} /></Grid>
            <Grid size={{ xs: 12, sm: 4 }}><TextField fullWidth label="Price billed to customer" type="number" value={form.price} onChange={(e) => set('price', e.target.value)} slotProps={MONEY_PROPS} /></Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField fullWidth label="Margin" disabled value={money((Number(form.price) || 0) - (Number(form.cost) || 0))} />
            </Grid>
            <Grid size={{ xs: 12 }}><TextField fullWidth label="Notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!canSave || save.isPending} onClick={() => save.mutate()}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(paying)} onClose={() => setPaying(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Pay {paying?.vendor_name}</DialogTitle>
        <DialogContent>
          {pay.isError && <Alert severity="error" sx={{ mb: 2 }}>{getErrorMessage(pay.error, 'Could not record the payment')}</Alert>}
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">{paying?.job_number} — balance owed {money(paying?.balance_to_pay ?? 0)}</Typography>
            <TextField label="Amount paid" type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} slotProps={MONEY_PROPS} autoFocus />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPaying(null)}>Cancel</Button>
          <Button variant="contained" disabled={!(Number(payAmount) > 0) || pay.isPending} onClick={() => pay.mutate()}>Save</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete outsource job"
        message={`Delete ${deleting?.job_number ?? 'this job'}?`}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
        loading={remove.isPending}
      />
    </Box>
  );
}
