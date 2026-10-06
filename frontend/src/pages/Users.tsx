import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody,
  Button, IconButton, TextField, MenuItem, Chip, Switch, FormControlLabel,
  Dialog, DialogTitle, DialogContent, DialogActions, Stack, CircularProgress, Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { usersApi } from '../api/usersApi';
import { getErrorMessage } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import type { AppUser, UserCreateInput, UserUpdateInput } from '../types/users';
import type { UserRole } from '../types/common';
import ConfirmDialog from '../components/ConfirmDialog';

const ROLES: UserRole[] = ['admin', 'counter', 'production', 'accounts'];
const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin', counter: 'Counter', production: 'Production', accounts: 'Accounts',
};
const ROLE_HINTS: Record<UserRole, string> = {
  admin: 'Full access -- pricing, users, cancel/delete, everything',
  counter: 'Take orders, create quotations/invoices, record payments',
  production: 'Update job card status and comments',
  accounts: 'Cash ledger, purchases/inventory, payments',
};
const ROLE_COLORS: Record<UserRole, 'error' | 'primary' | 'warning' | 'success'> = {
  admin: 'error', counter: 'primary', production: 'warning', accounts: 'success',
};

interface FormValues {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

export default function Users() {
  const queryClient = useQueryClient();
  const { user: me } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [deleting, setDeleting] = useState<AppUser | null>(null);

  const listQuery = useQuery({ queryKey: ['users'], queryFn: usersApi.list });

  const { control, register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    defaultValues: { name: '', email: '', password: '', role: 'counter' },
  });

  const saveMutation = useMutation({
    mutationFn: (data: FormValues) => {
      if (editing) {
        const payload: UserUpdateInput = { name: data.name, role: data.role };
        if (data.password) payload.password = data.password;
        return usersApi.update(editing.id, payload);
      }
      const payload: UserCreateInput = { name: data.name, email: data.email, password: data.password, role: data.role };
      return usersApi.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setDialogOpen(false);
      setEditing(null);
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (u: AppUser) => usersApi.update(u.id, { is_active: !u.is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => usersApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setDeleting(null);
    },
  });

  const openCreate = () => {
    setEditing(null);
    reset({ name: '', email: '', password: '', role: 'counter' });
    setDialogOpen(true);
  };

  const openEdit = (u: AppUser) => {
    setEditing(u);
    reset({ name: u.name, email: u.email, password: '', role: u.role });
    setDialogOpen(true);
  };

  const rows = listQuery.data ?? [];

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
          Users
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} sx={{ bgcolor: '#1a237e' }} onClick={openCreate}>
          Add User
        </Button>
      </Box>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Admin can view high-level reports, change prices, and cancel/update/delete orders. Counter takes orders and
        payments. Production updates job status. Accounts manages the cash ledger and purchases.
      </Typography>

      <Paper sx={{ borderRadius: 2 }}>
        {listQuery.isLoading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <CircularProgress />
          </Box>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    {u.name} {u.id === Number(me?.id) && <Chip label="You" size="small" sx={{ ml: 1 }} />}
                  </TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <Chip label={ROLE_LABELS[u.role]} color={ROLE_COLORS[u.role]} size="small" />
                  </TableCell>
                  <TableCell>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={u.is_active}
                          size="small"
                          disabled={u.id === Number(me?.id)}
                          onChange={() => toggleActiveMutation.mutate(u)}
                        />
                      }
                      label={u.is_active ? 'Active' : 'Inactive'}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => openEdit(u)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" disabled={u.id === Number(me?.id)} onClick={() => setDeleting(u)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                    No users yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <form onSubmit={handleSubmit((data) => saveMutation.mutate(data))}>
          <DialogTitle>{editing ? 'Edit User' : 'Add User'}</DialogTitle>
          <DialogContent>
            {saveMutation.isError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {getErrorMessage(saveMutation.error, 'Failed to save user')}
              </Alert>
            )}
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                label="Name"
                required
                fullWidth
                autoFocus
                error={Boolean(errors.name)}
                {...register('name', { required: true })}
              />
              <TextField
                label="Email"
                type="email"
                required
                fullWidth
                disabled={Boolean(editing)}
                helperText={editing ? "Email can't be changed after the account is created" : undefined}
                error={Boolean(errors.email)}
                {...register('email', { required: true })}
              />
              <TextField
                label={editing ? 'New Password (leave blank to keep current)' : 'Password'}
                type="password"
                required={!editing}
                fullWidth
                error={Boolean(errors.password)}
                {...register('password', { required: !editing })}
              />
              <Controller
                name="role"
                control={control}
                render={({ field }) => (
                  <TextField label="Role" select fullWidth {...field}>
                    {ROLES.map((r) => (
                      <MenuItem key={r} value={r}>
                        <Box>
                          <Typography variant="body2">{ROLE_LABELS[r]}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {ROLE_HINTS[r]}
                          </Typography>
                        </Box>
                      </MenuItem>
                    ))}
                  </TextField>
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
        title="Delete User"
        message={`Are you sure you want to delete "${deleting?.name}"? If they have orders or payments linked to them, deactivate instead -- deletion will fail to protect that history.`}
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </Box>
  );
}
