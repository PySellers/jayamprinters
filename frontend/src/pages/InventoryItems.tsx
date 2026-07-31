import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody,
  Button, IconButton, Chip, CircularProgress, Dialog, DialogTitle, DialogContent,
  DialogActions, Stack, TextField, Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import TuneIcon from '@mui/icons-material/Tune';
import { inventoryItemsApi } from '../api/purchasesApi';
import { useAuth } from '../context/AuthContext';
import { useNotify } from '../context/NotificationContext';
import { getErrorMessage } from '../utils/api';
import type { InventoryItem, InventoryItemInput, StockAdjustmentInput } from '../types/purchases';
import EmptyState from '../components/EmptyState';

export default function InventoryItems() {
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const canAdjust = hasRole('admin', 'accounts');
  const notify = useNotify();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [adjusting, setAdjusting] = useState<InventoryItem | null>(null);

  const itemsQuery = useQuery({ queryKey: ['inventory-items'], queryFn: inventoryItemsApi.list });

  const { register, handleSubmit, reset } = useForm<InventoryItemInput>({
    defaultValues: { name: '', unit: '', reorder_level: 0, is_active: true },
  });

  const saveMutation = useMutation({
    mutationFn: (data: InventoryItemInput) =>
      editing ? inventoryItemsApi.update(editing.id, data) : inventoryItemsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      notify(editing ? 'Item updated' : 'Item added');
      setDialogOpen(false);
      setEditing(null);
    },
    onError: (error) => notify(getErrorMessage(error, 'Failed to save item'), 'error'),
  });

  const {
    register: registerAdjust,
    handleSubmit: handleSubmitAdjust,
    reset: resetAdjust,
  } = useForm<StockAdjustmentInput>({ defaultValues: { quantity: 0, notes: '' } });

  const adjustMutation = useMutation({
    mutationFn: (data: StockAdjustmentInput) => inventoryItemsApi.adjust(adjusting!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      notify('Stock adjusted');
      setAdjusting(null);
    },
    onError: (error) => notify(getErrorMessage(error, 'Failed to adjust stock'), 'error'),
  });

  const openCreate = () => {
    setEditing(null);
    reset({ name: '', unit: '', reorder_level: 0, is_active: true });
    setDialogOpen(true);
  };

  const openEdit = (item: InventoryItem) => {
    setEditing(item);
    reset({ name: item.name, unit: item.unit, reorder_level: item.reorder_level, is_active: item.is_active });
    setDialogOpen(true);
  };

  const openAdjust = (item: InventoryItem) => {
    setAdjusting(item);
    resetAdjust({ quantity: 0, notes: '' });
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
          Inventory
        </Typography>
        {isAdmin && (
          <Button variant="contained" startIcon={<AddIcon />} sx={{ bgcolor: '#1a237e' }} onClick={openCreate}>
            Add Item
          </Button>
        )}
      </Box>

      <Paper sx={{ borderRadius: 2, overflowX: 'auto' }}>
        {itemsQuery.isLoading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <CircularProgress />
          </Box>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Unit</TableCell>
                <TableCell>Current Stock</TableCell>
                <TableCell>Reorder Level</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(itemsQuery.data ?? []).map((item) => {
                const lowStock = item.current_stock <= item.reorder_level;
                return (
                  <TableRow key={item.id} sx={lowStock ? { bgcolor: 'rgba(211, 47, 47, 0.08)' } : undefined}>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.unit}</TableCell>
                    <TableCell>
                      {item.current_stock}
                      {lowStock && <Chip label="Low Stock" color="error" size="small" sx={{ ml: 1 }} />}
                    </TableCell>
                    <TableCell>{item.reorder_level}</TableCell>
                    <TableCell>
                      <Chip label={item.is_active ? 'Active' : 'Inactive'} color={item.is_active ? 'success' : 'default'} size="small" />
                    </TableCell>
                    <TableCell align="right">
                      {canAdjust && (
                        <IconButton size="small" onClick={() => openAdjust(item)} title="Adjust Stock">
                          <TuneIcon fontSize="small" />
                        </IconButton>
                      )}
                      {isAdmin && (
                        <IconButton size="small" onClick={() => openEdit(item)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {(itemsQuery.data ?? []).length === 0 && <EmptyState colSpan={6} message="No inventory items yet." />}
            </TableBody>
          </Table>
        )}
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <form onSubmit={handleSubmit((data) => saveMutation.mutate(data))}>
          <DialogTitle>{editing ? 'Edit Item' : 'Add Item'}</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField label="Name" required fullWidth autoFocus {...register('name', { required: true })} />
              <TextField label="Unit" placeholder="e.g. ream, kg, roll, box" required fullWidth {...register('unit', { required: true })} />
              <TextField
                label="Reorder Level"
                type="number"
                fullWidth
                {...register('reorder_level', { valueAsNumber: true })}
              />
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

      <Dialog open={Boolean(adjusting)} onClose={() => setAdjusting(null)} maxWidth="xs" fullWidth>
        <form onSubmit={handleSubmitAdjust((data) => adjustMutation.mutate({ ...data, quantity: Number(data.quantity) }))}>
          <DialogTitle>Adjust Stock — {adjusting?.name}</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Alert severity="info">
                Current stock: {adjusting?.current_stock} {adjusting?.unit}. Enter a positive number to add stock,
                negative to remove (e.g. wastage, stock count correction).
              </Alert>
              <TextField
                label="Quantity Change"
                type="number"
                fullWidth
                required
                {...registerAdjust('quantity', { required: true, valueAsNumber: true })}
              />
              <TextField label="Notes" fullWidth multiline rows={2} {...registerAdjust('notes')} />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAdjusting(null)} disabled={adjustMutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={adjustMutation.isPending}>
              Save
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
}
