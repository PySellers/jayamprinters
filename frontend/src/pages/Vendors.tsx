import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody,
  Button, IconButton, Chip, CircularProgress, Dialog, DialogTitle, DialogContent,
  DialogActions, Stack, TextField,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { vendorsApi } from '../api/purchasesApi';
import { useAuth } from '../context/AuthContext';
import { useNotify } from '../context/NotificationContext';
import { getErrorMessage } from '../utils/api';
import type { Vendor, VendorInput } from '../types/purchases';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';

export default function Vendors() {
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const canManage = hasRole('admin', 'accounts');
  const notify = useNotify();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [deleting, setDeleting] = useState<Vendor | null>(null);

  const vendorsQuery = useQuery({ queryKey: ['vendors'], queryFn: vendorsApi.list });

  const { register, handleSubmit, reset } = useForm<VendorInput>({
    defaultValues: { name: '', phone: '', email: '', address: '', gstin: '', notes: '', is_active: true },
  });

  const saveMutation = useMutation({
    mutationFn: (data: VendorInput) => (editing ? vendorsApi.update(editing.id, data) : vendorsApi.create(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      notify(editing ? 'Vendor updated' : 'Vendor added');
      setDialogOpen(false);
      setEditing(null);
    },
    onError: (error) => notify(getErrorMessage(error, 'Failed to save vendor'), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => vendorsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      notify('Vendor deleted');
      setDeleting(null);
    },
    onError: (error) => {
      notify(getErrorMessage(error, 'Failed to delete vendor'), 'error');
      setDeleting(null);
    },
  });

  const openCreate = () => {
    setEditing(null);
    reset({ name: '', phone: '', email: '', address: '', gstin: '', notes: '', is_active: true });
    setDialogOpen(true);
  };

  const openEdit = (vendor: Vendor) => {
    setEditing(vendor);
    reset({
      name: vendor.name,
      phone: vendor.phone ?? '',
      email: vendor.email ?? '',
      address: vendor.address ?? '',
      gstin: vendor.gstin ?? '',
      notes: vendor.notes ?? '',
      is_active: vendor.is_active,
    });
    setDialogOpen(true);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
          Vendors
        </Typography>
        {canManage && (
          <Button variant="contained" startIcon={<AddIcon />} sx={{ bgcolor: '#1a237e' }} onClick={openCreate}>
            Add Vendor
          </Button>
        )}
      </Box>

      <Paper sx={{ borderRadius: 2, overflowX: 'auto' }}>
        {vendorsQuery.isLoading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <CircularProgress />
          </Box>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Phone</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>GSTIN</TableCell>
                <TableCell>Status</TableCell>
                {canManage && <TableCell align="right">Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {(vendorsQuery.data ?? []).map((v) => (
                <TableRow key={v.id}>
                  <TableCell>{v.name}</TableCell>
                  <TableCell>{v.phone || '-'}</TableCell>
                  <TableCell>{v.email || '-'}</TableCell>
                  <TableCell>{v.gstin || '-'}</TableCell>
                  <TableCell>
                    <Chip label={v.is_active ? 'Active' : 'Inactive'} color={v.is_active ? 'success' : 'default'} size="small" />
                  </TableCell>
                  {canManage && (
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => openEdit(v)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => setDeleting(v)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {(vendorsQuery.data ?? []).length === 0 && <EmptyState colSpan={6} message="No vendors yet." />}
            </TableBody>
          </Table>
        )}
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <form onSubmit={handleSubmit((data) => saveMutation.mutate(data))}>
          <DialogTitle>{editing ? 'Edit Vendor' : 'Add Vendor'}</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField label="Name" required fullWidth autoFocus {...register('name', { required: true })} />
              <TextField label="Phone" fullWidth {...register('phone')} />
              <TextField label="Email" fullWidth {...register('email')} />
              <TextField label="Address" fullWidth multiline rows={2} {...register('address')} />
              <TextField label="GSTIN" fullWidth {...register('gstin')} />
              <TextField label="Notes" fullWidth multiline rows={2} {...register('notes')} />
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
        title="Delete Vendor"
        message={`Are you sure you want to delete "${deleting?.name}"? This cannot be undone.`}
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </Box>
  );
}
