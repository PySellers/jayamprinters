import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody,
  Button, IconButton, TextField, Chip, Dialog, DialogTitle, DialogContent,
  DialogActions, Stack, CircularProgress, Alert, Checkbox, FormControlLabel,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { inventoryApi } from '../api/inventoryApi';
import { getErrorMessage } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import type { InventoryItem, InventoryItemInput } from '../types/purchases';
import ConfirmDialog from '../components/ConfirmDialog';
import EntitySelect from '../components/pickers/EntitySelect';
import { customersApi } from '../api/customersApi';

export default function Inventory() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canWrite = user?.role === 'admin' || user?.role === 'accounts';

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [deleting, setDeleting] = useState<InventoryItem | null>(null);

  const listQuery = useQuery({ queryKey: ['inventory'], queryFn: inventoryApi.list });
  // the customer's own material kept in the shop (paper they brought ...): picked by customer, never counted as the shop's stock to buy
  const [ownerId, setOwnerId] = useState<number | null>(null);
  const [customerOwned, setCustomerOwned] = useState(false);
  const [ownerError, setOwnerError] = useState('');

  const { register, handleSubmit, reset, formState: { errors } } = useForm<InventoryItemInput>({
    defaultValues: { name: '', unit: 'pcs', current_qty: 0, reorder_threshold: 0, notes: '' },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: InventoryItemInput) => {
      let name = data.name.trim();
      let customerId: number | null = null;
      if (customerOwned) {
        if (!ownerId) { setOwnerError('Choose the customer this material belongs to'); throw new Error('Choose the customer this material belongs to'); }
        const customer = (await customersApi.list()).find((c) => c.id === ownerId);
        customerId = ownerId;
        const who = customer ? (customer.billing_person_name || customer.name) : '';
        if (who && !name.toLowerCase().includes(who.toLowerCase())) name = `${name} - ${who}`;
      }
      const body = { ...data, name, customer_id: customerId };
      return editing ? inventoryApi.update(editing.id, body) : inventoryApi.create(body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setDialogOpen(false);
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => inventoryApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setDeleting(null);
    },
  });

  const openCreate = () => {
    setEditing(null);
    setCustomerOwned(false);
    setOwnerId(null);
    setOwnerError('');
    reset({ name: '', unit: 'pcs', current_qty: 0, reorder_threshold: 0, notes: '' });
    setDialogOpen(true);
  };

  const openEdit = (item: InventoryItem) => {
    setEditing(item);
    setCustomerOwned(Boolean(item.customer_id));
    setOwnerId(item.customer_id ?? null);
    setOwnerError('');
    reset({
      name: item.name, unit: item.unit, current_qty: item.current_qty,
      reorder_threshold: item.reorder_threshold, notes: item.notes ?? '',
    });
    setDialogOpen(true);
  };

  const rows = listQuery.data ?? [];
  const lowStockCount = rows.filter((r) => r.low_stock && !r.customer_id).length;
  const emptyCount = rows.filter((r) => r.stock_state === 'empty' && !r.customer_id).length;

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
          Inventory
        </Typography>
        {canWrite && (
          <Button variant="contained" startIcon={<AddIcon />} sx={{ bgcolor: '#1a237e' }} onClick={openCreate}>
            Add Item
          </Button>
        )}
      </Box>

      {lowStockCount > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <span data-testid="stock-alert">
            Time to buy: {lowStockCount} item{lowStockCount > 1 ? 's are' : ' is'} at or below its reorder level
            {emptyCount > 0 ? ` (${emptyCount} completely out of stock)` : ''} -- see the Status column below.
          </span>
        </Alert>
      )}

      <Paper sx={{ borderRadius: 2 }}>
        {listQuery.isLoading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <CircularProgress />
          </Box>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Item</TableCell>
                <TableCell>Unit</TableCell>
                <TableCell>Current Qty</TableCell>
                <TableCell>Reorder Threshold</TableCell>
                <TableCell>Belongs to</TableCell>
                <TableCell>Status</TableCell>
                {canWrite && <TableCell align="right">Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.name}</TableCell>
                  <TableCell>{item.unit}</TableCell>
                  <TableCell>{item.current_qty}</TableCell>
                  <TableCell>{item.reorder_threshold}</TableCell>
                  <TableCell>{item.customer_name ? <Chip size="small" label={`Customer: ${item.customer_name}`} variant="outlined" /> : 'Shop'}</TableCell>
                  <TableCell>
                    {item.stock_state === 'empty' && !item.customer_id ? (
                      <Chip label="Empty - buy" color="error" size="small" />
                    ) : item.low_stock && !item.customer_id ? (
                      <Chip label="Low Stock" color="warning" size="small" />
                    ) : (
                      <Chip label="OK" color="success" size="small" variant="outlined" />
                    )}
                  </TableCell>
                  {canWrite && (
                    <TableCell align="right">
                      <IconButton size="small" aria-label="Edit" onClick={() => openEdit(item)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" aria-label="Delete" onClick={() => setDeleting(item)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canWrite ? 7 : 6} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                    No inventory items tracked yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <form onSubmit={handleSubmit((data) => saveMutation.mutate({ ...data, current_qty: Number(data.current_qty), reorder_threshold: Number(data.reorder_threshold) }))}>
          <DialogTitle>{editing ? 'Edit Inventory Item' : 'Add Inventory Item'}</DialogTitle>
          <DialogContent>
            {saveMutation.isError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {getErrorMessage(saveMutation.error, 'Failed to save item')}
              </Alert>
            )}
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField label="Item Name" required fullWidth autoFocus error={Boolean(errors.name)} {...register('name', { required: true })} />
              <TextField label="Unit (e.g. sheets, reams, pcs, litres)" required fullWidth {...register('unit', { required: true })} />
              <TextField label="Current Quantity" type="number" slotProps={{ htmlInput: { step: 'any' } }} fullWidth {...register('current_qty', { valueAsNumber: true })} />
              <TextField label="Reorder Threshold" type="number" slotProps={{ htmlInput: { step: 'any' } }} fullWidth helperText="Flagged Low Stock at or below this level" {...register('reorder_threshold', { valueAsNumber: true })} />
              <TextField label="Notes" fullWidth multiline rows={2} {...register('notes')} />
              <FormControlLabel
                control={<Checkbox checked={customerOwned} onChange={(e) => setCustomerOwned(e.target.checked)} slotProps={{ input: { ...({ 'data-testid': 'customer-owned' } as object) } }} />}
                label="Customer's own material (kept in our shop for their jobs)"
              />
              {customerOwned && (
                <Box>
                  <EntitySelect
                    label="Customer" required mode="list" queryKey="inventory-owner-picker"
                    fetchOptions={customersApi.list} getOptionLabel={(c) => `${c.billing_person_name || c.name}${c.phone ? ` (${c.phone})` : ''}`}
                    value={ownerId} onChange={(id) => { setOwnerId(id); setOwnerError(''); }}
                  />
                  {ownerError && <Typography variant="caption" color="error">{ownerError}</Typography>}
                </Box>
              )}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)} disabled={saveMutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={saveMutation.isPending}>
              Save
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete Inventory Item"
        message={`Are you sure you want to delete "${deleting?.name}"?`}
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </Box>
  );
}
