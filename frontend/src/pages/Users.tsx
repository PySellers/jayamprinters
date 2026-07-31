import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody,
  Button, IconButton, Chip, CircularProgress, Dialog, DialogTitle, DialogContent,
  DialogActions, Stack, TextField, MenuItem, Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import { usersApi } from '../api/usersApi';
import EmptyState from '../components/EmptyState';
import { getErrorMessage } from '../utils/api';
import { useNotify } from '../context/NotificationContext';
import type { AppUser, UserCreateInput, UserRole, UserUpdateInput } from '../types/users';

const ROLE_OPTIONS: UserRole[] = ['admin', 'counter', 'production', 'accounts'];
const ROLE_COLORS: Record<UserRole, 'error' | 'primary' | 'warning' | 'success'> = {
  admin: 'error',
  counter: 'primary',
  production: 'warning',
  accounts: 'success',
};

type FormValues = UserCreateInput;

export default function Users() {
  const queryClient = useQueryClient();
  const notify = useNotify();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AppUser | null>(null);

  const usersQuery = useQuery({ queryKey: ['users'], queryFn: usersApi.list });

  const { control, register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    defaultValues: { name: '', email: '', password: '', role: 'counter', department: '' },
  });

  const saveMutation = useMutation({
    mutationFn: (data: FormValues) =>
      editing
        ? usersApi.update(editing.id, data as UserUpdateInput)
        : usersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      notify(editing ? 'User updated' : 'User created');
      setDialogOpen(false);
      setEditing(null);
      reset({ name: '', email: '', password: '', role: 'counter', department: '' });
    },
  });

  const openCreate = () => {
    setEditing(null);
    reset({ name: '', email: '', password: '', role: 'counter', department: '' });
    setDialogOpen(true);
  };

  const openEdit = (user: AppUser) => {
    setEditing(user);
    reset({ name: user.name, email: user.email, password: '', role: user.role, department: user.department ?? '' });
    setDialogOpen(true);
  };

  const toggleActive = (user: AppUser) => {
    usersApi
      .update(user.id, { is_active: !user.is_active })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['users'] });
        notify(user.is_active ? 'User deactivated' : 'User activated');
      })
      .catch((error) => notify(getErrorMessage(error, 'Failed to update user'), 'error'));
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
          Users
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} sx={{ bgcolor: '#1a237e' }} onClick={openCreate}>
          Add User
        </Button>
      </Box>

      <Paper sx={{ borderRadius: 2, overflowX: 'auto' }}>
        {usersQuery.isLoading ? (
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
                <TableCell>Department</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(usersQuery.data ?? []).map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <Chip label={u.role} color={ROLE_COLORS[u.role]} size="small" />
                  </TableCell>
                  <TableCell>{u.department || '-'}</TableCell>
                  <TableCell>
                    <Chip
                      label={u.is_active ? 'Active' : 'Inactive'}
                      color={u.is_active ? 'success' : 'default'}
                      size="small"
                      onClick={() => toggleActive(u)}
                      sx={{ cursor: 'pointer' }}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => openEdit(u)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {(usersQuery.data ?? []).length === 0 && <EmptyState colSpan={6} message="No staff users yet." />}
            </TableBody>
          </Table>
        )}
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <form onSubmit={handleSubmit((data) => saveMutation.mutate(data))}>
          <DialogTitle>{editing ? `Edit ${editing.name}` : 'Add User'}</DialogTitle>
          <DialogContent>
            {saveMutation.isError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {getErrorMessage(saveMutation.error, 'Failed to save user')}
              </Alert>
            )}
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                label="Name"
                fullWidth
                required
                error={Boolean(errors.name)}
                {...register('name', { required: true })}
              />
              <TextField
                label="Email"
                type="email"
                fullWidth
                required
                disabled={Boolean(editing)}
                error={Boolean(errors.email)}
                {...register('email', { required: true })}
              />
              {!editing && (
                <TextField
                  label="Password"
                  type="password"
                  fullWidth
                  required
                  error={Boolean(errors.password)}
                  {...register('password', { required: true, minLength: 6 })}
                />
              )}
              <Controller
                name="role"
                control={control}
                render={({ field }) => (
                  <TextField label="Role" select fullWidth {...field}>
                    {ROLE_OPTIONS.map((r) => (
                      <MenuItem key={r} value={r}>
                        {r.charAt(0).toUpperCase() + r.slice(1)}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
              />
              <TextField
                label="Department"
                placeholder="e.g. Design, Printing, Binding, Accounts"
                fullWidth
                {...register('department')}
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
    </Box>
  );
}
