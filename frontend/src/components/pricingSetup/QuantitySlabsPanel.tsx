import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Paper, Table, TableHead, TableRow, TableCell, TableBody,
  Button, IconButton, CircularProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { quantitySlabsApi } from '../../api/quantitySlabsApi';
import type { QuantitySlab, QuantitySlabInput } from '../../types/quantitySlabs';
import QuantitySlabFormDialog from './QuantitySlabFormDialog';
import ConfirmDialog from '../ConfirmDialog';

interface QuantitySlabsPanelProps {
  categoryId: number;
}

export default function QuantitySlabsPanel({ categoryId }: QuantitySlabsPanelProps) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<QuantitySlab | null>(null);
  const [deleting, setDeleting] = useState<QuantitySlab | null>(null);

  const slabsQuery = useQuery({ queryKey: ['quantity-slabs', categoryId], queryFn: () => quantitySlabsApi.list(categoryId) });

  const saveMutation = useMutation({
    mutationFn: (values: Omit<QuantitySlabInput, 'category_id'>) =>
      editing
        ? quantitySlabsApi.update(editing.id, values)
        : quantitySlabsApi.create({ ...values, category_id: categoryId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quantity-slabs', categoryId] });
      setDialogOpen(false);
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => quantitySlabsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quantity-slabs', categoryId] });
      setDeleting(null);
    },
  });

  const rangeLabel = (slab: QuantitySlab) => `${slab.min_quantity} – ${slab.max_quantity ?? '∞'}`;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          sx={{ bgcolor: '#1a237e' }}
          onClick={() => { setEditing(null); setDialogOpen(true); }}
        >
          Add Slab
        </Button>
      </Box>

      <Paper sx={{ borderRadius: 2, overflowX: 'auto' }}>
        {slabsQuery.isLoading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <CircularProgress />
          </Box>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Range</TableCell>
                <TableCell>Label</TableCell>
                <TableCell>Order</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(slabsQuery.data ?? []).map((slab) => (
                <TableRow key={slab.id}>
                  <TableCell>{rangeLabel(slab)}</TableCell>
                  <TableCell>{slab.label || '-'}</TableCell>
                  <TableCell>{slab.display_order}</TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => { setEditing(slab); setDialogOpen(true); }}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => setDeleting(slab)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {(slabsQuery.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                    No quantity slabs yet for this category.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Paper>

      <QuantitySlabFormDialog
        open={dialogOpen}
        title={editing ? 'Edit Quantity Slab' : 'Add Quantity Slab'}
        initialValues={editing}
        loading={saveMutation.isPending}
        onSave={(values) => saveMutation.mutate(values)}
        onCancel={() => { setDialogOpen(false); setEditing(null); }}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete Quantity Slab"
        message={`Are you sure you want to delete "${deleting ? rangeLabel(deleting) : ''}"?`}
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </Box>
  );
}
