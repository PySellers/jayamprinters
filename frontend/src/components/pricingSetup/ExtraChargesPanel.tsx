import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Paper, Table, TableHead, TableRow, TableCell, TableBody,
  Button, IconButton, Chip, CircularProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { extraChargesApi } from '../../api/extraChargesApi';
import type { ExtraCharge, ExtraChargeInput } from '../../types/extraCharges';
import ExtraChargeFormDialog from './ExtraChargeFormDialog';
import ConfirmDialog from '../ConfirmDialog';

interface ExtraChargesPanelProps {
  categoryId: number;
}

export default function ExtraChargesPanel({ categoryId }: ExtraChargesPanelProps) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ExtraCharge | null>(null);
  const [deleting, setDeleting] = useState<ExtraCharge | null>(null);

  const chargesQuery = useQuery({ queryKey: ['extra-charges', categoryId], queryFn: () => extraChargesApi.list(categoryId) });

  const saveMutation = useMutation({
    mutationFn: (values: Omit<ExtraChargeInput, 'category_id'> & { global: boolean }) => {
      const { global, ...rest } = values;
      const payload: ExtraChargeInput = { ...rest, category_id: global ? null : categoryId };
      return editing ? extraChargesApi.update(editing.id, payload) : extraChargesApi.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['extra-charges', categoryId] });
      setDialogOpen(false);
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => extraChargesApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['extra-charges', categoryId] });
      setDeleting(null);
    },
  });

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          sx={{ bgcolor: '#1a237e' }}
          onClick={() => { setEditing(null); setDialogOpen(true); }}
        >
          Add Extra Charge
        </Button>
      </Box>

      <Paper sx={{ borderRadius: 2 }}>
        {chargesQuery.isLoading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <CircularProgress />
          </Box>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Amount</TableCell>
                <TableCell>Scope</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(chargesQuery.data ?? []).map((charge) => (
                <TableRow key={charge.id}>
                  <TableCell>{charge.name}</TableCell>
                  <TableCell><Chip label={charge.charge_type.replace('_', ' ')} size="small" /></TableCell>
                  <TableCell>₹{charge.amount.toFixed(2)}</TableCell>
                  <TableCell>
                    <Chip label={charge.category_id === null ? 'Global' : 'This category'} size="small" color={charge.category_id === null ? 'primary' : 'default'} />
                  </TableCell>
                  <TableCell>
                    <Chip label={charge.is_active ? 'Active' : 'Inactive'} color={charge.is_active ? 'success' : 'default'} size="small" />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => { setEditing(charge); setDialogOpen(true); }}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => setDeleting(charge)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {(chargesQuery.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                    No extra charges yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Paper>

      <ExtraChargeFormDialog
        open={dialogOpen}
        title={editing ? 'Edit Extra Charge' : 'Add Extra Charge'}
        initialValues={editing}
        loading={saveMutation.isPending}
        onSave={(values) => saveMutation.mutate(values)}
        onCancel={() => { setDialogOpen(false); setEditing(null); }}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete Extra Charge"
        message={`Are you sure you want to delete "${deleting?.name}"?`}
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </Box>
  );
}
