import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody,
  Button, IconButton, Chip, Stack, CircularProgress, Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { productsApi, productCategoriesApi } from '../api/productsApi';
import { priceMatrixApi } from '../api/priceMatrixApi';
import { attributesApi } from '../api/attributesApi';
import { quantitySlabsApi } from '../api/quantitySlabsApi';
import type { PriceMatrixCell, PriceMatrixCellInput } from '../types/priceMatrix';
import PriceMatrixCellFormDialog from '../components/priceMatrix/PriceMatrixCellFormDialog';
import ConfirmDialog from '../components/ConfirmDialog';

export default function PriceMatrix() {
  const { productId } = useParams<{ productId: string }>();
  const id = Number(productId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PriceMatrixCell | null>(null);
  const [deleting, setDeleting] = useState<PriceMatrixCell | null>(null);

  const productQuery = useQuery({ queryKey: ['product', id], queryFn: () => productsApi.get(id) });
  const categoriesQuery = useQuery({ queryKey: ['product-categories'], queryFn: productCategoriesApi.list });
  const categoryId = productQuery.data?.category_id ?? null;

  const cellsQuery = useQuery({ queryKey: ['price-matrix-cells', id], queryFn: () => priceMatrixApi.list(id) });
  const attributesQuery = useQuery({
    queryKey: ['attributes', categoryId],
    queryFn: () => attributesApi.list(categoryId),
    enabled: Boolean(categoryId),
  });
  const slabsQuery = useQuery({
    queryKey: ['quantity-slabs', categoryId],
    queryFn: () => quantitySlabsApi.list(categoryId),
    enabled: Boolean(categoryId),
  });

  const saveMutation = useMutation({
    mutationFn: (values: Omit<PriceMatrixCellInput, 'product_id'>) =>
      editing
        ? priceMatrixApi.update(editing.id, values)
        : priceMatrixApi.create({ ...values, product_id: id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-matrix-cells', id] });
      setDialogOpen(false);
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (cellId: number) => priceMatrixApi.remove(cellId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-matrix-cells', id] });
      setDeleting(null);
    },
  });

  const slabLabel = (slabId: number) => {
    const slab = slabsQuery.data?.find((s) => s.id === slabId);
    if (!slab) return `#${slabId}`;
    return `${slab.min_quantity} – ${slab.max_quantity ?? '∞'}`;
  };

  const optionChips = (cell: PriceMatrixCell) =>
    cell.options.map((opt) => {
      const attribute = attributesQuery.data?.find((a) => a.id === opt.attribute_id);
      const option = attribute?.options.find((o) => o.id === opt.attribute_option_id);
      return `${attribute?.name ?? '#' + opt.attribute_id}: ${option?.value ?? '#' + opt.attribute_option_id}`;
    });

  if (productQuery.isLoading) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  const product = productQuery.data;
  if (!product) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="error">Product not found.</Typography>
      </Box>
    );
  }

  const categoryName = categoriesQuery.data?.find((c) => c.id === product.category_id)?.name ?? '-';

  return (
    <Box sx={{ p: 3 }}>
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/products')} sx={{ mb: 2 }}>
        Back to Products
      </Button>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
            Price Matrix — {product.name}
          </Typography>
          <Typography color="text.secondary">Category: {categoryName}</Typography>
        </Box>
        {product.pricing_type !== 'fixed' && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            sx={{ bgcolor: '#1a237e' }}
            onClick={() => { setEditing(null); setDialogOpen(true); }}
          >
            Add Cell
          </Button>
        )}
      </Box>

      {product.pricing_type === 'fixed' ? (
        <Alert severity="info">
          This product uses a fixed price (₹{product.fixed_price?.toFixed(2)}) and doesn't use a price matrix.
        </Alert>
      ) : (
        <Paper sx={{ borderRadius: 2 }}>
          {cellsQuery.isLoading ? (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <CircularProgress />
            </Box>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Quantity Slab</TableCell>
                  <TableCell>Attributes Covered</TableCell>
                  <TableCell>Unit Price</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(cellsQuery.data ?? []).map((cell) => (
                  <TableRow key={cell.id}>
                    <TableCell>{slabLabel(cell.quantity_slab_id)}</TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap' }}>
                        {optionChips(cell).map((label) => (
                          <Chip key={label} label={label} size="small" />
                        ))}
                        {cell.options.length === 0 && <Typography color="text.secondary" variant="body2">None</Typography>}
                      </Stack>
                    </TableCell>
                    <TableCell>₹{cell.unit_price.toFixed(2)}</TableCell>
                    <TableCell>
                      <Chip label={cell.is_active ? 'Active' : 'Inactive'} color={cell.is_active ? 'success' : 'default'} size="small" />
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => { setEditing(cell); setDialogOpen(true); }}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => setDeleting(cell)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {(cellsQuery.data ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                      No price matrix cells yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </Paper>
      )}

      <PriceMatrixCellFormDialog
        open={dialogOpen}
        title={editing ? 'Edit Price Matrix Cell' : 'Add Price Matrix Cell'}
        categoryId={categoryId}
        initialValues={editing}
        loading={saveMutation.isPending}
        onSave={(values) => saveMutation.mutate(values)}
        onCancel={() => { setDialogOpen(false); setEditing(null); }}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete Price Matrix Cell"
        message="Are you sure you want to delete this price matrix cell?"
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </Box>
  );
}
