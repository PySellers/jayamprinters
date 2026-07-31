import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody,
  Button, IconButton, Chip, CircularProgress, Dialog, DialogTitle, DialogContent,
  DialogActions, Stack, TextField, MenuItem, Divider, List, ListItem, ListItemText,
  FormControlLabel, Switch, Accordion, AccordionSummary, AccordionDetails,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import EditIcon from '@mui/icons-material/Edit';
import SendIcon from '@mui/icons-material/Send';
import { jobCardsApi } from '../api/jobCardsApi';
import { customersApi } from '../api/customersApi';
import { productsApi } from '../api/productsApi';
import { usersApi } from '../api/usersApi';
import { createMasterApi } from '../api/mastersApi';
import { useAuth } from '../context/AuthContext';
import { useNotify } from '../context/NotificationContext';
import { getErrorMessage } from '../utils/api';
import type { JobCard, JobCardUpdateInput } from '../types/jobCards';
import type { JobCardStatus, JobCardPriority } from '../types/common';
import StatusMenu from '../components/StatusMenu';
import EntitySelect from '../components/pickers/EntitySelect';
import EmptyState from '../components/EmptyState';

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
  const notify = useNotify();
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-cards'] });
      notify('Job status updated');
    },
    onError: (error) => notify(getErrorMessage(error, 'Failed to update status'), 'error'),
  });

  const { control, register, handleSubmit, reset, watch, setValue } = useForm<JobCardUpdateInput>();
  const proofVerifiedCustomer = watch('proof_verified_customer');
  const proofVerifiedPressAt = watch('proof_verified_press_at');

  const assignMutation = useMutation({
    mutationFn: (data: JobCardUpdateInput) => jobCardsApi.update(assigning!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-cards'] });
      notify('Job card updated');
      setAssigning(null);
    },
    onError: (error) => notify(getErrorMessage(error, 'Failed to update job card'), 'error'),
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
      order_taken_by_id: jobCard.order_taken_by_id,
      rubber_stamp_by_id: jobCard.rubber_stamp_by_id,
      numbering_by_id: jobCard.numbering_by_id,
      binding_by_id: jobCard.binding_by_id,
      proof_verified_customer: jobCard.proof_verified_customer,
      proof_verified_press_id: jobCard.proof_verified_press_id,
      proof_verified_press_at: jobCard.proof_verified_press_at,
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
    onError: (error) => notify(getErrorMessage(error, 'Failed to add update'), 'error'),
  });

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 2 }}>
        Job Cards
      </Typography>

      <Paper sx={{ borderRadius: 2, overflowX: 'auto' }}>
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
                <EmptyState colSpan={10} message="No job cards yet. Convert a quotation to create some." />
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

              <Accordion disableGutters>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                    Production Stages
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Stack spacing={2}>
                    <Controller
                      name="order_taken_by_id"
                      control={control}
                      render={({ field }) => (
                        <EntitySelect
                          label="Order Taken By"
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
                      name="rubber_stamp_by_id"
                      control={control}
                      render={({ field }) => (
                        <EntitySelect
                          label="Rubber Stamp By"
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
                      name="numbering_by_id"
                      control={control}
                      render={({ field }) => (
                        <EntitySelect
                          label="Numbering By"
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
                      name="binding_by_id"
                      control={control}
                      render={({ field }) => (
                        <EntitySelect
                          label="Binding By"
                          mode="list"
                          queryKey="user-picker"
                          fetchOptions={usersApi.list}
                          getOptionLabel={(o) => (o.department ? `${o.name} (${o.department})` : o.name)}
                          value={field.value}
                          onChange={field.onChange}
                        />
                      )}
                    />
                    <FormControlLabel
                      control={
                        <Switch
                          checked={Boolean(proofVerifiedCustomer)}
                          onChange={(e) => setValue('proof_verified_customer', e.target.checked ? new Date().toISOString() : null)}
                        />
                      }
                      label={proofVerifiedCustomer ? `Proof Verified by Customer (${new Date(proofVerifiedCustomer).toLocaleString()})` : 'Proof Verified by Customer'}
                    />
                    <Controller
                      name="proof_verified_press_id"
                      control={control}
                      render={({ field }) => (
                        <EntitySelect
                          label="Proof Verified By (Press)"
                          mode="list"
                          queryKey="user-picker"
                          fetchOptions={usersApi.list}
                          getOptionLabel={(o) => (o.department ? `${o.name} (${o.department})` : o.name)}
                          value={field.value}
                          onChange={field.onChange}
                        />
                      )}
                    />
                    <FormControlLabel
                      control={
                        <Switch
                          checked={Boolean(proofVerifiedPressAt)}
                          onChange={(e) => setValue('proof_verified_press_at', e.target.checked ? new Date().toISOString() : null)}
                        />
                      }
                      label={proofVerifiedPressAt ? `Proof Verified by Press (${new Date(proofVerifiedPressAt).toLocaleString()})` : 'Proof Verified by Press'}
                    />
                  </Stack>
                </AccordionDetails>
              </Accordion>

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
