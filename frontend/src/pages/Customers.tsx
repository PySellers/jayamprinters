import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody,
  Button, IconButton, TextField, Dialog, DialogTitle, DialogContent, DialogActions,
  Stack, CircularProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import { customersApi } from '../api/customersApi';
import type { Customer, CustomerInput } from '../types/customers';
import ConfirmDialog from '../components/ConfirmDialog';

export default function Customers() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);

  const listQuery = useQuery({ queryKey: ['customers'], queryFn: customersApi.list });
  const searchQuery = useQuery({
    queryKey: ['customers', 'search', search],
    queryFn: () => customersApi.search(search),
    enabled: search.length > 0,
  });

  const rows = search.length > 0 ? searchQuery.data ?? [] : listQuery.data ?? [];
  const loading = search.length > 0 ? searchQuery.isFetching : listQuery.isLoading;

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CustomerInput>();

  const saveMutation = useMutation({
    mutationFn: (data: CustomerInput) =>
      editing ? customersApi.update(editing.id, data) : customersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setDialogOpen(false);
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => customersApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setDeleting(null);
    },
  });

  const openCreate = () => {
    setEditing(null);
    reset({ name: '', billing_person_name: '', phone: '', email: '', reason: '', gstin: '' });
    setDialogOpen(true);
  };

  const openEdit = (customer: Customer) => {
    setEditing(customer);
    reset({
      name: customer.name,
      billing_person_name: customer.billing_person_name ?? '',
      phone: customer.phone ?? '',
      email: customer.email ?? '',
      reason: customer.reason ?? '',
      gstin: customer.gstin ?? '',
    });
    setDialogOpen(true);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
          Customers
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} sx={{ bgcolor: '#1a237e' }} onClick={openCreate}>
          Add Customer
        </Button>
      </Box>

      <TextField
        placeholder="Search by name or phone..."
        size="small"
        fullWidth
        sx={{ mb: 2, bgcolor: 'white' }}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        slotProps={{ input: { startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} /> } }}
      />

      <Paper sx={{ borderRadius: 2 }}>
        {loading ? (
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
                <TableCell>Reason</TableCell>
                <TableCell>GSTIN</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell>{customer.name}</TableCell>
                  <TableCell>{customer.phone}</TableCell>
                  <TableCell>{customer.email || '-'}</TableCell>
                  <TableCell>{customer.reason || '-'}</TableCell>
                  <TableCell>{customer.gstin || '-'}</TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => openEdit(customer)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => setDeleting(customer)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                    No customers yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <form onSubmit={handleSubmit((data) => saveMutation.mutate(data))}>
          <DialogTitle>{editing ? 'Edit Customer' : 'Add Customer'}</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                label="Name"
                required
                fullWidth
                autoFocus
                error={Boolean(errors.name)}
                {...register('name', { required: true })}
              />
              <TextField label="Billing Person Name (optional)" fullWidth {...register('billing_person_name')} />
              <TextField
                label="Phone"
                required
                fullWidth
                error={Boolean(errors.phone)}
                {...register('phone', { required: true })}
              />
              <TextField
                label="Email"
                type="email"
                required
                fullWidth
                error={Boolean(errors.email)}
                {...register('email', { required: true })}
              />
              <TextField
                label="Reason"
                required
                fullWidth
                multiline
                rows={2}
                error={Boolean(errors.reason)}
                {...register('reason', { required: true })}
              />
              <TextField label="GSTIN (optional)" fullWidth {...register('gstin')} />
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
        title="Delete Customer"
        message={`Are you sure you want to delete "${deleting?.name}"? This cannot be undone.`}
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </Box>
  );
}