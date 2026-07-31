import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody,
  Button, IconButton, CircularProgress, Dialog, DialogTitle, DialogContent,
  DialogActions, Stack, TextField, Grid, Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { purchasesApi, vendorsApi, inventoryItemsApi } from '../api/purchasesApi';
import { getErrorMessage } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useNotify } from '../context/NotificationContext';
import type { Purchase, PurchaseInput } from '../types/purchases';
import EntitySelect from '../components/pickers/EntitySelect';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';

const emptyItem = { inventory_item_id: 0, quantity: 1, unit_price: 0 };

export default function Purchases() {
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const canManage = hasRole('admin', 'accounts');
  const notify = useNotify();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<Purchase | null>(null);

  const purchasesQuery = useQuery({ queryKey: ['purchases'], queryFn: purchasesApi.list });
  const vendorsQuery = useQuery({ queryKey: ['vendors'], queryFn: vendorsApi.list });
  const inventoryQuery = useQuery({ queryKey: ['inventory-items'], queryFn: inventoryItemsApi.list });

  const vendorName = (id: number) => vendorsQuery.data?.find((v) => v.id === id)?.name ?? `#${id}`;
  const itemName = (id: number) => inventoryQuery.data?.find((i) => i.id === id)?.name ?? `#${id}`;

  const { control, register, handleSubmit, reset, watch } = useForm<PurchaseInput>({
    defaultValues: { vendor_id: 0, tax_amount: 0, notes: '', items: [emptyItem] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const items = watch('items');
  const taxAmount = watch('tax_amount') || 0;
  const subtotal = (items ?? []).reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0);

  const createMutation = useMutation({
    mutationFn: (data: PurchaseInput) => purchasesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      notify('Purchase recorded, stock updated');
      setDialogOpen(false);
      reset({ vendor_id: 0, tax_amount: 0, notes: '', items: [emptyItem] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => purchasesApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      notify('Purchase deleted, stock reversed');
      setDeleting(null);
    },
    onError: (error) => {
      notify(getErrorMessage(error, 'Failed to delete purchase'), 'error');
      setDeleting(null);
    },
  });

  const openCreate = () => {
    reset({ vendor_id: 0, tax_amount: 0, notes: '', items: [emptyItem] });
    setDialogOpen(true);
  };

  const onSubmit = (data: PurchaseInput) => {
    createMutation.mutate({
      ...data,
      vendor_id: Number(data.vendor_id),
      tax_amount: Number(data.tax_amount) || 0,
      items: data.items.map((it) => ({
        inventory_item_id: Number(it.inventory_item_id),
        quantity: Number(it.quantity),
        unit_price: Number(it.unit_price),
      })),
    });
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
          Purchases
        </Typography>
        {canManage && (
          <Button variant="contained" startIcon={<AddIcon />} sx={{ bgcolor: '#1a237e' }} onClick={openCreate}>
            Record Purchase
          </Button>
        )}
      </Box>

      <Paper sx={{ borderRadius: 2, overflowX: 'auto' }}>
        {purchasesQuery.isLoading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <CircularProgress />
          </Box>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Purchase #</TableCell>
                <TableCell>Vendor</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Items</TableCell>
                <TableCell>Grand Total</TableCell>
                {canManage && <TableCell align="right">Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {(purchasesQuery.data ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.purchase_number}</TableCell>
                  <TableCell>{vendorName(p.vendor_id)}</TableCell>
                  <TableCell>{p.purchase_date}</TableCell>
                  <TableCell>{p.items.map((it) => `${itemName(it.inventory_item_id)} (${it.quantity})`).join(', ')}</TableCell>
                  <TableCell>₹{p.grand_total.toFixed(2)}</TableCell>
                  {canManage && (
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => setDeleting(p)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {(purchasesQuery.data ?? []).length === 0 && <EmptyState colSpan={6} message="No purchases recorded yet." />}
            </TableBody>
          </Table>
        )}
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogTitle>Record Purchase</DialogTitle>
          <DialogContent>
            {createMutation.isError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {getErrorMessage(createMutation.error, 'Failed to record purchase')}
              </Alert>
            )}
            <Alert severity="info" sx={{ mb: 2 }}>
              This records goods that have already arrived — stock is credited immediately for every line item.
            </Alert>
            <Stack spacing={2}>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Controller
                    name="vendor_id"
                    control={control}
                    rules={{ required: true }}
                    render={({ field }) => (
                      <EntitySelect
                        label="Vendor"
                        required
                        mode="list"
                        queryKey="vendor-picker"
                        fetchOptions={vendorsApi.list}
                        getOptionLabel={(v) => v.name}
                        value={field.value}
                        onChange={field.onChange}
                      />
                    )}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField label="Tax Amount" type="number" fullWidth {...register('tax_amount', { valueAsNumber: true })} />
                </Grid>
              </Grid>

              <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                Items
              </Typography>
              {fields.map((field, index) => (
                <Grid container spacing={2} key={field.id} sx={{ alignItems: 'center' }}>
                  <Grid size={{ xs: 12, sm: 5 }}>
                    <Controller
                      name={`items.${index}.inventory_item_id`}
                      control={control}
                      rules={{ required: true }}
                      render={({ field: f }) => (
                        <EntitySelect
                          label="Inventory Item"
                          required
                          mode="list"
                          queryKey="inventory-item-picker"
                          fetchOptions={inventoryItemsApi.list}
                          getOptionLabel={(i) => `${i.name} (${i.unit})`}
                          value={f.value}
                          onChange={f.onChange}
                        />
                      )}
                    />
                  </Grid>
                  <Grid size={{ xs: 5, sm: 3 }}>
                    <TextField
                      label="Quantity"
                      type="number"
                      fullWidth
                      size="small"
                      {...register(`items.${index}.quantity`, { required: true, valueAsNumber: true, min: 0.01 })}
                    />
                  </Grid>
                  <Grid size={{ xs: 5, sm: 3 }}>
                    <TextField
                      label="Unit Price"
                      type="number"
                      fullWidth
                      size="small"
                      {...register(`items.${index}.unit_price`, { required: true, valueAsNumber: true, min: 0 })}
                    />
                  </Grid>
                  <Grid size={{ xs: 2, sm: 1 }}>
                    <IconButton onClick={() => remove(index)} disabled={fields.length <= 1}>
                      <DeleteIcon />
                    </IconButton>
                  </Grid>
                </Grid>
              ))}
              <Button startIcon={<AddIcon />} onClick={() => append(emptyItem)} sx={{ alignSelf: 'flex-start' }}>
                Add Item
              </Button>

              <TextField label="Notes" fullWidth multiline rows={2} {...register('notes')} />

              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                  Grand Total: ₹{(subtotal + Number(taxAmount || 0)).toFixed(2)}
                </Typography>
              </Box>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)} disabled={createMutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={createMutation.isPending}>
              Save
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete Purchase"
        message={`Are you sure you want to delete "${deleting?.purchase_number}"? This will reverse the stock it added.`}
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </Box>
  );
}
