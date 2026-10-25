import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import {
  Alert, Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody, Button, IconButton, Chip,
  CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, Stack, TextField, FormControlLabel, Switch,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { hsnApi } from '../api/companyApi';
import { getErrorMessage } from '../utils/api';
import type { HsnCode, HsnInput } from '../types/company';
import ConfirmDialog from '../components/ConfirmDialog';

/**
 * HSN / SAC codes and their GST rate. Each service (Pricing Setup > Printing & Tax) or item points at one, and
 * GST is then worked out line by line: half of the rate as CGST, half as SGST.
 */
export default function HsnCodes() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<HsnCode | null>(null);
  const [deleting, setDeleting] = useState<HsnCode | null>(null);

  const listQuery = useQuery({ queryKey: ['hsn-codes'], queryFn: hsnApi.list });
  const { control, register, handleSubmit, reset, formState: { errors } } = useForm<HsnInput>();

  const saveMutation = useMutation({
    mutationFn: (data: HsnInput) => (editing ? hsnApi.update(editing.id, data) : hsnApi.create(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hsn-codes'] });
      setDialogOpen(false);
      setEditing(null);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => hsnApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hsn-codes'] });
      setDeleting(null);
    },
  });

  const openCreate = () => {
    setEditing(null);
    saveMutation.reset();
    reset({ code: '', description: '', gst_rate: 18, is_active: true });
    setDialogOpen(true);
  };
  const openEdit = (row: HsnCode) => {
    setEditing(row);
    saveMutation.reset();
    reset({ code: row.code, description: row.description ?? '', gst_rate: row.gst_rate, is_active: row.is_active });
    setDialogOpen(true);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>HSN / SAC Codes</Typography>
        <Button variant="contained" startIcon={<AddIcon />} sx={{ bgcolor: '#1a237e' }} onClick={openCreate}>Add HSN</Button>
      </Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        GST is worked out line by line from the HSN code of each service (Pricing Setup &gt; Printing &amp; Tax) or item.
        A rate of 18% prints as CGST 9% + SGST 9%. Rates marked TEST are placeholders until the CA confirms them.
      </Alert>

      <Paper sx={{ borderRadius: 2, overflowX: 'auto' }}>
        {listQuery.isLoading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>HSN / SAC</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>GST %</TableCell>
                <TableCell>CGST + SGST</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(listQuery.data ?? []).map((row) => (
                <TableRow key={row.id}>
                  <TableCell sx={{ fontWeight: 700 }}>{row.code}</TableCell>
                  <TableCell>{row.description}</TableCell>
                  <TableCell>{row.gst_rate}%</TableCell>
                  <TableCell>{row.gst_rate / 2}% + {row.gst_rate / 2}%</TableCell>
                  <TableCell><Chip size="small" label={row.is_active ? 'Active' : 'Inactive'} color={row.is_active ? 'success' : 'default'} /></TableCell>
                  <TableCell align="right">
                    <IconButton size="small" aria-label="Edit" onClick={() => openEdit(row)}><EditIcon fontSize="small" /></IconButton>
                    <IconButton size="small" aria-label="Delete" onClick={() => setDeleting(row)}><DeleteIcon fontSize="small" /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <form onSubmit={handleSubmit((data) => saveMutation.mutate({ ...data, gst_rate: Number(data.gst_rate) }))}>
          <DialogTitle>{editing ? 'Edit HSN / SAC' : 'Add HSN / SAC'}</DialogTitle>
          <DialogContent>
            {saveMutation.isError && <Alert severity="error" sx={{ mb: 2 }}>{getErrorMessage(saveMutation.error, 'Could not save')}</Alert>}
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField label="HSN / SAC code" required fullWidth error={Boolean(errors.code)} {...register('code', { required: true })} />
              <TextField label="Description" fullWidth {...register('description')} />
              <TextField
                label="GST rate (%)" type="number" required fullWidth slotProps={{ htmlInput: { step: 'any' } }}
                helperText="Total GST; it is split equally into CGST and SGST"
                {...register('gst_rate', { required: true, valueAsNumber: true, min: 0, max: 100 })}
              />
              <Controller name="is_active" control={control} render={({ field }) => (
                <FormControlLabel control={<Switch checked={Boolean(field.value)} onChange={(e) => field.onChange(e.target.checked)} />} label="Active" />
              )} />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={saveMutation.isPending}>Save</Button>
          </DialogActions>
        </form>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete HSN code"
        message={`Delete ${deleting?.code ?? 'this code'}? Services or items using it must be pointed at another code first.`}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
        loading={deleteMutation.isPending}
      />
      {deleteMutation.isError && <Alert severity="error" sx={{ mt: 2 }}>{getErrorMessage(deleteMutation.error, 'Could not delete')}</Alert>}
    </Box>
  );
}
