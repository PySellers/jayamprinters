import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import {
  Box, Typography, Paper, Tabs, Tab, Table, TableHead, TableRow, TableCell, TableBody,
  Button, IconButton, TextField, MenuItem, Chip, Dialog, DialogTitle, DialogContent,
  DialogActions, Stack, CircularProgress, Alert, Grid,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PaymentIcon from '@mui/icons-material/Payment';
import { vendorsApi } from '../api/vendorsApi';
import { purchasesApi } from '../api/purchasesApi';
import { inventoryApi } from '../api/inventoryApi';
import { getErrorMessage } from '../utils/api';
import type { Vendor, VendorInput, Purchase, PurchaseInput } from '../types/purchases';
import type { PaymentMethod } from '../types/common';
import EntitySelect from '../components/pickers/EntitySelect';
import ConfirmDialog from '../components/ConfirmDialog';

const STATUS_COLORS: Record<string, 'default' | 'warning' | 'success'> = {
  unpaid: 'default', partially_paid: 'warning', paid: 'success',
};
const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'upi', 'card', 'credit', 'bank_transfer'];

function VendorsTab() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [deleting, setDeleting] = useState<Vendor | null>(null);

  const listQuery = useQuery({ queryKey: ['vendors'], queryFn: vendorsApi.list });
  const { register, handleSubmit, reset, formState: { errors } } = useForm<VendorInput>({
    defaultValues: { name: '', phone: '', email: '', address: '', gstin: '' },
  });

  const saveMutation = useMutation({
    mutationFn: (data: VendorInput) => (editing ? vendorsApi.update(editing.id, data) : vendorsApi.create(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      setDialogOpen(false);
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => vendorsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      setDeleting(null);
    },
  });

  const openCreate = () => {
    setEditing(null);
    reset({ name: '', phone: '', email: '', address: '', gstin: '' });
    setDialogOpen(true);
  };
  const openEdit = (v: Vendor) => {
    setEditing(v);
    reset({ name: v.name, phone: v.phone ?? '', email: v.email ?? '', address: v.address ?? '', gstin: v.gstin ?? '' });
    setDialogOpen(true);
  };

  const rows = listQuery.data ?? [];

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Button variant="contained" startIcon={<AddIcon />} sx={{ bgcolor: '#1a237e' }} onClick={openCreate}>
          Add Vendor
        </Button>
      </Box>
      <Paper sx={{ borderRadius: 2 }}>
        {listQuery.isLoading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell><TableCell>Phone</TableCell><TableCell>Email</TableCell>
                <TableCell>GSTIN</TableCell><TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((v) => (
                <TableRow key={v.id}>
                  <TableCell>{v.name}</TableCell>
                  <TableCell>{v.phone || '-'}</TableCell>
                  <TableCell>{v.email || '-'}</TableCell>
                  <TableCell>{v.gstin || '-'}</TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => openEdit(v)}><EditIcon fontSize="small" /></IconButton>
                    <IconButton size="small" onClick={() => setDeleting(v)}><DeleteIcon fontSize="small" /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={5} align="center" sx={{ color: 'text.secondary', py: 4 }}>No vendors yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <form onSubmit={handleSubmit((data) => saveMutation.mutate(data))}>
          <DialogTitle>{editing ? 'Edit Vendor' : 'Add Vendor'}</DialogTitle>
          <DialogContent>
            {saveMutation.isError && <Alert severity="error" sx={{ mb: 2 }}>{getErrorMessage(saveMutation.error, 'Failed to save vendor')}</Alert>}
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField label="Name" required fullWidth autoFocus error={Boolean(errors.name)} {...register('name', { required: true })} />
              <TextField label="Phone" fullWidth {...register('phone')} />
              <TextField label="Email" fullWidth {...register('email')} />
              <TextField label="Address" fullWidth {...register('address')} />
              <TextField label="GSTIN" fullWidth {...register('gstin')} />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)} disabled={saveMutation.isPending}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={saveMutation.isPending}>Save</Button>
          </DialogActions>
        </form>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete Vendor"
        message={`Are you sure you want to delete "${deleting?.name}"?`}
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}

const emptyLine = { inventory_item_id: 0, quantity: 1, unit_price: 0 };

function PurchasesTab() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<Purchase | null>(null);

  const listQuery = useQuery({ queryKey: ['purchases'], queryFn: purchasesApi.list });
  const vendorsQuery = useQuery({ queryKey: ['vendors'], queryFn: vendorsApi.list });

  const vendorName = (id: number) => vendorsQuery.data?.find((v) => v.id === id)?.name ?? `#${id}`;

  const { control, register, handleSubmit, reset } = useForm<PurchaseInput>({
    defaultValues: { vendor_id: 0, notes: '', items: [emptyLine] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const createMutation = useMutation({
    mutationFn: (data: PurchaseInput) => purchasesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setDialogOpen(false);
      reset({ vendor_id: 0, notes: '', items: [emptyLine] });
    },
  });

  const { register: registerPay, handleSubmit: handlePaySubmit, reset: resetPay } = useForm<{ amount: number; method: PaymentMethod }>({
    defaultValues: { amount: 0, method: 'cash' },
  });
  const paymentMutation = useMutation({
    mutationFn: (vars: { id: number; amount: number; method: PaymentMethod }) =>
      purchasesApi.addPayment(vars.id, { amount: vars.amount, method: vars.method }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      setPaymentTarget(null);
      resetPay({ amount: 0, method: 'cash' });
    },
  });

  const openCreate = () => {
    reset({ vendor_id: 0, notes: '', items: [emptyLine] });
    setDialogOpen(true);
  };

  const rows = listQuery.data ?? [];

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Button variant="contained" startIcon={<AddIcon />} sx={{ bgcolor: '#1a237e' }} onClick={openCreate}>
          New Purchase
        </Button>
      </Box>
      <Paper sx={{ borderRadius: 2 }}>
        {listQuery.isLoading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Purchase #</TableCell><TableCell>Vendor</TableCell><TableCell>Date</TableCell>
                <TableCell>Total</TableCell><TableCell>Paid</TableCell><TableCell>Balance</TableCell>
                <TableCell>Status</TableCell><TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.purchase_number}</TableCell>
                  <TableCell>{vendorName(p.vendor_id)}</TableCell>
                  <TableCell>{p.purchase_date}</TableCell>
                  <TableCell>₹{p.total_amount.toFixed(2)}</TableCell>
                  <TableCell>₹{p.paid_amount.toFixed(2)}</TableCell>
                  <TableCell>₹{(p.total_amount - p.paid_amount).toFixed(2)}</TableCell>
                  <TableCell><Chip label={p.status.replace('_', ' ')} color={STATUS_COLORS[p.status]} size="small" /></TableCell>
                  <TableCell align="right">
                    {p.total_amount - p.paid_amount > 0 && (
                      <IconButton size="small" onClick={() => setPaymentTarget(p)}>
                        <PaymentIcon fontSize="small" />
                      </IconButton>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={8} align="center" sx={{ color: 'text.secondary', py: 4 }}>No purchases recorded yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <form onSubmit={handleSubmit((data) => createMutation.mutate(data))}>
          <DialogTitle>New Purchase</DialogTitle>
          <DialogContent>
            {createMutation.isError && <Alert severity="error" sx={{ mb: 2 }}>{getErrorMessage(createMutation.error, 'Failed to save purchase')}</Alert>}
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Controller
                name="vendor_id"
                control={control}
                rules={{ validate: (v) => v > 0 || 'Vendor is required' }}
                render={({ field }) => (
                  <EntitySelect
                    label="Vendor" required mode="list" queryKey="vendor-picker"
                    fetchOptions={vendorsApi.list} getOptionLabel={(v) => v.name}
                    value={field.value || null} onChange={(id) => field.onChange(id ?? 0)}
                  />
                )}
              />
              <Typography variant="subtitle2">Items</Typography>
              {fields.map((f, index) => (
                <Grid container spacing={1} key={f.id} sx={{ alignItems: 'center' }}>
                  <Grid size={{ xs: 5 }}>
                    <Controller
                      name={`items.${index}.inventory_item_id`}
                      control={control}
                      rules={{ validate: (v) => v > 0 || 'Required' }}
                      render={({ field }) => (
                        <EntitySelect
                          label="Inventory Item" required size="small" mode="list" queryKey="inventory-item-picker"
                          fetchOptions={inventoryApi.list} getOptionLabel={(i) => `${i.name} (${i.unit})`}
                          value={field.value || null} onChange={(id) => field.onChange(id ?? 0)}
                        />
                      )}
                    />
                  </Grid>
                  <Grid size={{ xs: 3 }}>
                    <TextField label="Quantity" type="number" size="small" fullWidth {...register(`items.${index}.quantity`, { valueAsNumber: true, min: 0.01 })} />
                  </Grid>
                  <Grid size={{ xs: 3 }}>
                    <TextField label="Unit Price" type="number" size="small" fullWidth {...register(`items.${index}.unit_price`, { valueAsNumber: true, min: 0 })} />
                  </Grid>
                  <Grid size={{ xs: 1 }}>
                    <IconButton size="small" onClick={() => remove(index)} disabled={fields.length === 1}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Grid>
                </Grid>
              ))}
              <Button size="small" startIcon={<AddIcon />} onClick={() => append(emptyLine)} sx={{ alignSelf: 'flex-start' }}>
                Add line
              </Button>
              <TextField label="Notes" fullWidth multiline rows={2} {...register('notes')} />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)} disabled={createMutation.isPending}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={createMutation.isPending}>Save Purchase</Button>
          </DialogActions>
        </form>
      </Dialog>

      <Dialog open={Boolean(paymentTarget)} onClose={() => setPaymentTarget(null)} maxWidth="xs" fullWidth>
        <form onSubmit={handlePaySubmit((data) => paymentTarget && paymentMutation.mutate({ id: paymentTarget.id, amount: Number(data.amount), method: data.method }))}>
          <DialogTitle>Record Payment -- {paymentTarget?.purchase_number}</DialogTitle>
          <DialogContent>
            {paymentMutation.isError && <Alert severity="error" sx={{ mb: 2 }}>{getErrorMessage(paymentMutation.error, 'Failed to record payment')}</Alert>}
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                label="Amount" type="number" fullWidth required
                {...registerPay('amount', { required: true, valueAsNumber: true, min: 0.01, max: paymentTarget ? paymentTarget.total_amount - paymentTarget.paid_amount : undefined })}
              />
              <TextField label="Method" select fullWidth defaultValue="cash" {...registerPay('method')}>
                {PAYMENT_METHODS.map((m) => <MenuItem key={m} value={m}>{m.replace('_', ' ')}</MenuItem>)}
              </TextField>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setPaymentTarget(null)} disabled={paymentMutation.isPending}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={paymentMutation.isPending}>Save</Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}

export default function Purchases() {
  const [tab, setTab] = useState(0);
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 2 }}>Purchases</Typography>
      <Paper sx={{ borderRadius: 2, mb: 3 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label="Purchases" />
          <Tab label="Vendors" />
        </Tabs>
      </Paper>
      {tab === 0 && <PurchasesTab />}
      {tab === 1 && <VendorsTab />}
    </Box>
  );
}
