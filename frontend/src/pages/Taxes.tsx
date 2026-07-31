import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody,
  Button, IconButton, Chip, CircularProgress, Dialog, DialogTitle, DialogContent,
  DialogActions, Stack, TextField, FormControlLabel, Switch,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { taxesApi } from '../api/taxesApi';
import { getErrorMessage } from '../utils/api';
import { useNotify } from '../context/NotificationContext';
import type { Tax } from '../types/masters';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';

type TaxInput = Omit<Tax, 'id'>;

export default function Taxes() {
  const queryClient = useQueryClient();
  const notify = useNotify();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Tax | null>(null);
  const [deleting, setDeleting] = useState<Tax | null>(null);

  const taxesQuery = useQuery({ queryKey: ['taxes'], queryFn: taxesApi.list });

  const { control, register, handleSubmit, reset, formState: { errors } } = useForm<TaxInput>();

  const saveMutation = useMutation({
    mutationFn: (data: TaxInput) => (editing ? taxesApi.update(editing.id, data) : taxesApi.create(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taxes'] });
      notify(editing ? 'Tax updated' : 'Tax added');
      setDialogOpen(false);
      setEditing(null);
    },
    onError: (error) => notify(getErrorMessage(error, 'Failed to save tax'), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => taxesApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taxes'] });
      notify('Tax deleted');
      setDeleting(null);
    },
    onError: (error) => {
      notify(getErrorMessage(error, 'Failed to delete tax'), 'error');
      setDeleting(null);
    },
  });

  const openCreate = () => {
    setEditing(null);
    reset({ name: '', rate_percent: 0, is_default: false, is_active: true });
    setDialogOpen(true);
  };

  const openEdit = (tax: Tax) => {
    setEditing(tax);
    reset({ name: tax.name, rate_percent: tax.rate_percent, is_default: tax.is_default, is_active: tax.is_active });
    setDialogOpen(true);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
          Tax
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} sx={{ bgcolor: '#1a237e' }} onClick={openCreate}>
          Add Tax
        </Button>
      </Box>

      <Paper sx={{ borderRadius: 2, overflowX: 'auto' }}>
        {taxesQuery.isLoading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <CircularProgress />
          </Box>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Rate</TableCell>
                <TableCell>Default</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(taxesQuery.data ?? []).map((tax) => (
                <TableRow key={tax.id}>
                  <TableCell>{tax.name}</TableCell>
                  <TableCell>{tax.rate_percent}%</TableCell>
                  <TableCell>{tax.is_default && <Chip label="Default" color="primary" size="small" />}</TableCell>
                  <TableCell>
                    <Chip label={tax.is_active ? 'Active' : 'Inactive'} color={tax.is_active ? 'success' : 'default'} size="small" />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => openEdit(tax)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => setDeleting(tax)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {(taxesQuery.data ?? []).length === 0 && <EmptyState colSpan={5} message="No taxes yet." />}
            </TableBody>
          </Table>
        )}
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <form onSubmit={handleSubmit((data) => saveMutation.mutate(data))}>
          <DialogTitle>{editing ? 'Edit Tax' : 'Add Tax'}</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField label="Name" required fullWidth autoFocus error={Boolean(errors.name)} {...register('name', { required: true })} />
              <TextField
                label="Rate (%)"
                type="number"
                required
                fullWidth
                error={Boolean(errors.rate_percent)}
                {...register('rate_percent', { required: true, valueAsNumber: true, min: 0 })}
              />
              <Controller
                name="is_default"
                control={control}
                render={({ field }) => (
                  <FormControlLabel
                    control={<Switch checked={field.value ?? false} onChange={(e) => field.onChange(e.target.checked)} />}
                    label="Default tax for new quotations"
                  />
                )}
              />
              <Controller
                name="is_active"
                control={control}
                render={({ field }) => (
                  <FormControlLabel
                    control={<Switch checked={field.value ?? true} onChange={(e) => field.onChange(e.target.checked)} />}
                    label="Active"
                  />
                )}
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

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete Tax"
        message={`Are you sure you want to delete "${deleting?.name}"? This cannot be undone.`}
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </Box>
  );
}
