import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody,
  Button, IconButton, Chip, CircularProgress, Dialog, DialogTitle, DialogContent,
  DialogActions, Stack, TextField, MenuItem, Divider, List, ListItem, ListItemText,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import SendIcon from '@mui/icons-material/Send';
import { jobCardsApi } from '../api/jobCardsApi';
import { customersApi } from '../api/customersApi';
import { productsApi } from '../api/productsApi';
import { usersApi } from '../api/usersApi';
import { createMasterApi } from '../api/mastersApi';
import { useAuth } from '../context/AuthContext';
import type { JobCard, JobCardUpdateInput } from '../types/jobCards';
import type { JobCardStatus, JobCardPriority } from '../types/common';
import StatusMenu from '../components/StatusMenu';
import EntitySelect from '../components/pickers/EntitySelect';

const machinesApi = createMasterApi('/machines');

const STATUS_OPTIONS: JobCardStatus[] = ['pending', 'design', 'approval', 'printing', 'binding', 'packing', 'delivered'];
const STATUS_COLORS: Record<string, 'default' | 'info' | 'success' | 'warning' | 'primary'> = {
  pending: 'default',
  design: 'info',
  approval: 'warning',
  printing: 'primary',
  binding: 'primary',
  packing: 'warning',
  delivered: 'success',
};
const PRIORITY_OPTIONS: JobCardPriority[] = ['low', 'medium', 'high', 'urgent'];
const PRIORITY_COLORS: Record<string, 'default' | 'info' | 'warning' | 'error'> = {
  low: 'default',
  medium: 'info',
  high: 'warning',
  urgent: 'error',
};

export default function JobCards() {
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const canManageProduction = hasRole('admin', 'production');
  const [assigning, setAssigning] = useState<JobCard | null>(null);
  const [commentText, setCommentText] = useState('');

  const jobCardsQuery = useQuery({ queryKey: ['job-cards'], queryFn: jobCardsApi.list });
  const customersQuery = useQuery({ queryKey: ['customers'], queryFn: customersApi.list });
  const productsQuery = useQuery({ queryKey: ['products'], queryFn: productsApi.list });
  const usersQuery = useQuery({ queryKey: ['users'], queryFn: usersApi.list });
  const machinesQuery = useQuery({ queryKey: ['masters', 'machines', 'list'], queryFn: machinesApi.list });

  const customerName = (id: number) => customersQuery.data?.find((c) => c.id === id)?.name ?? `#${id}`;
  const productName = (id: number) => productsQuery.data?.find((p) => p.id === id)?.name ?? `#${id}`;
  const userName = (id?: number | null) => (id ? usersQuery.data?.find((u) => u.id === id)?.name ?? `#${id}` : '-');
  const machineName = (id?: number | null) => (id ? machinesQuery.data?.find((m) => m.id === id)?.name ?? `#${id}` : '-');

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: JobCardStatus }) => jobCardsApi.updateStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['job-cards'] }),
  });

  const { control, register, handleSubmit, reset } = useForm<JobCardUpdateInput>();

  const assignMutation = useMutation({
    mutationFn: (data: JobCardUpdateInput) => jobCardsApi.update(assigning!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-cards'] });
      setAssigning(null);
    },
  });

  const openAssign = (jobCard: JobCard) => {
    setAssigning(jobCard);
    setCommentText('');
    reset({
      machine_id: jobCard.machine_id,
      designer_id: jobCard.designer_id,
      operator_id: jobCard.operator_id,
      delivery_date: jobCard.delivery_date,
      priority: jobCard.priority,
      notes: jobCard.notes ?? '',
    });
  };

  const commentsQuery = useQuery({
    queryKey: ['job-card-comments', assigning?.id],
    queryFn: () => jobCardsApi.listComments(assigning!.id),
    enabled: Boolean(assigning),
  });

  const addCommentMutation = useMutation({
    mutationFn: (text: string) => jobCardsApi.addComment(assigning!.id, { text }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-card-comments', assigning?.id] });
      setCommentText('');
    },
  });

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 2 }}>
        Job Cards
      </Typography>

      <Paper sx={{ borderRadius: 2 }}>
        {jobCardsQuery.isLoading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <CircularProgress />
          </Box>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Job #</TableCell>
                <TableCell>Customer</TableCell>
                <TableCell>Product</TableCell>
                <TableCell>Machine</TableCell>
                <TableCell>Designer</TableCell>
                <TableCell>Operator</TableCell>
                <TableCell>Priority</TableCell>
                <TableCell>Delivery</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(jobCardsQuery.data ?? []).map((jc) => (
                <TableRow key={jc.id}>
                  <TableCell>{jc.job_number}</TableCell>
                  <TableCell>{customerName(jc.customer_id)}</TableCell>
                  <TableCell>{productName(jc.product_id)}</TableCell>
                  <TableCell>{machineName(jc.machine_id)}</TableCell>
                  <TableCell>{userName(jc.designer_id)}</TableCell>
                  <TableCell>{userName(jc.operator_id)}</TableCell>
                  <TableCell>
                    <Chip label={jc.priority} color={PRIORITY_COLORS[jc.priority]} size="small" />
                  </TableCell>
                  <TableCell>{jc.delivery_date ?? '-'}</TableCell>
                  <TableCell>
                    <StatusMenu
                      status={jc.status}
                      allowedStatuses={STATUS_OPTIONS}
                      colorMap={STATUS_COLORS}
                      disabled={!canManageProduction}
                      onChange={(status) => statusMutation.mutate({ id: jc.id, status: status as JobCardStatus })}
                    />
                  </TableCell>
                  <TableCell align="right">
                    {canManageProduction && (
                      <IconButton size="small" onClick={() => openAssign(jc)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {(jobCardsQuery.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                    No job cards yet. Convert a quotation to create some.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Paper>

      <Dialog open={Boolean(assigning)} onClose={() => setAssigning(null)} maxWidth="sm" fullWidth>
        <form onSubmit={handleSubmit((data) => assignMutation.mutate(data))}>
          <DialogTitle>Assign — {assigning?.job_number}</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Controller
                name="machine_id"
                control={control}
                render={({ field }) => (
                  <EntitySelect
                    label="Machine"
                    mode="list"
                    queryKey="machine-picker"
                    fetchOptions={machinesApi.list}
                    getOptionLabel={(o) => o.name}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
              <Controller
                name="designer_id"
                control={control}
                render={({ field }) => (
                  <EntitySelect
                    label="Designer"
                    mode="list"
                    queryKey="user-picker"
                    fetchOptions={usersApi.list}
                    getOptionLabel={(o) => (o.department ? `${o.name} (${o.department})` : o.name)}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
              <Controller
                name="operator_id"
                control={control}
                render={({ field }) => (
                  <EntitySelect
                    label="Operator"
                    mode="list"
                    queryKey="user-picker"
                    fetchOptions={usersApi.list}
                    getOptionLabel={(o) => (o.department ? `${o.name} (${o.department})` : o.name)}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
              <TextField
                label="Delivery Date"
                type="date"
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
                {...register('delivery_date')}
              />
              <TextField label="Priority" select fullWidth defaultValue={assigning?.priority ?? 'medium'} {...register('priority')}>
                {PRIORITY_OPTIONS.map((p) => (
                  <MenuItem key={p} value={p}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </MenuItem>
                ))}
              </TextField>
              <TextField label="Notes" fullWidth multiline rows={2} {...register('notes')} />

              <Divider />
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                Update Log
              </Typography>
              {commentsQuery.isLoading ? (
                <Box sx={{ textAlign: 'center', py: 2 }}>
                  <CircularProgress size={20} />
                </Box>
              ) : (
                <List dense sx={{ maxHeight: 200, overflowY: 'auto', bgcolor: 'action.hover', borderRadius: 1 }}>
                  {(commentsQuery.data ?? []).map((comment) => (
                    <ListItem key={comment.id}>
                      <ListItemText
                        primary={comment.text}
                        secondary={new Date(comment.created_at).toLocaleString()}
                      />
                    </ListItem>
                  ))}
                  {(commentsQuery.data ?? []).length === 0 && (
                    <ListItem>
                      <ListItemText secondary="No updates logged yet." />
                    </ListItem>
                  )}
                </List>
              )}
              <Stack direction="row" spacing={1}>
                <TextField
                  label="Add update (e.g. waiting on spirals for binding)"
                  fullWidth
                  size="small"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                />
                <Button
                  variant="outlined"
                  startIcon={<SendIcon />}
                  disabled={!commentText.trim() || addCommentMutation.isPending}
                  onClick={() => addCommentMutation.mutate(commentText.trim())}
                >
                  Add
                </Button>
              </Stack>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAssigning(null)} disabled={assignMutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={assignMutation.isPending}>
              Save
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
}
