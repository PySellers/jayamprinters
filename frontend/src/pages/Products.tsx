import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody,
  Button, IconButton, Chip, CircularProgress, Dialog, DialogTitle, DialogContent,
  DialogActions, Stack, TextField, MenuItem, FormControlLabel, Switch,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import GridOnIcon from '@mui/icons-material/GridOn';
import { productsApi, productCategoriesApi } from '../api/productsApi';
import { useAuth } from '../context/AuthContext';
import { useNotify } from '../context/NotificationContext';
import { getErrorMessage } from '../utils/api';
import type { Product, ProductInput, ProductPricingType } from '../types/products';
import EntitySelect from '../components/pickers/EntitySelect';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';

const PRICING_TYPES: ProductPricingType[] = ['matrix', 'fixed', 'per_area'];
const PRICING_TYPE_LABELS: Record<ProductPricingType, string> = {
  matrix: 'Matrix (attribute + quantity based)',
  fixed: 'Fixed price (SKU)',
  per_area: 'Per area (rate per sq.ft)',
};

export default function Products() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const notify = useNotify();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);

  const productsQuery = useQuery({ queryKey: ['products'], queryFn: productsApi.list });
  const categoriesQuery = useQuery({ queryKey: ['product-categories'], queryFn: productCategoriesApi.list });

  const categoryName = (id?: number | null) =>
    id ? categoriesQuery.data?.find((c) => c.id === id)?.name ?? `#${id}` : '-';

  const { control, register, handleSubmit, reset, watch } = useForm<ProductInput>();
  const pricingType = watch('pricing_type');

  const saveMutation = useMutation({
    mutationFn: (data: ProductInput) => (editing ? productsApi.update(editing.id, data) : productsApi.create(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      notify(editing ? 'Product updated' : 'Product added');
      setDialogOpen(false);
      setEditing(null);
    },
    onError: (error) => notify(getErrorMessage(error, 'Failed to save product'), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => productsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      notify('Product deleted');
      setDeleting(null);
    },
    onError: (error) => {
      notify(getErrorMessage(error, 'Failed to delete product'), 'error');
      setDeleting(null);
    },
  });

  const openCreate = () => {
    setEditing(null);
    reset({ name: '', category_id: null, description: '', pricing_type: 'matrix', fixed_price: null, is_active: true });
    setDialogOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditing(product);
    reset({
      name: product.name,
      category_id: product.category_id,
      description: product.description ?? '',
      pricing_type: product.pricing_type,
      fixed_price: product.fixed_price,
      is_active: product.is_active,
    });
    setDialogOpen(true);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
          Products
        </Typography>
        {isAdmin && (
          <Button variant="contained" startIcon={<AddIcon />} sx={{ bgcolor: '#1a237e' }} onClick={openCreate}>
            Add Product
          </Button>
        )}
      </Box>

      <Paper sx={{ borderRadius: 2 }}>
        {productsQuery.isLoading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <CircularProgress />
          </Box>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Pricing Type</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(productsQuery.data ?? []).map((product) => (
                <TableRow key={product.id}>
                  <TableCell>{product.name}</TableCell>
                  <TableCell>{categoryName(product.category_id)}</TableCell>
                  <TableCell>
                    <Chip label={product.pricing_type} size="small" />
                  </TableCell>
                  <TableCell>
                    <Chip label={product.is_active ? 'Active' : 'Inactive'} color={product.is_active ? 'success' : 'default'} size="small" />
                  </TableCell>
                  <TableCell align="right">
                    {product.pricing_type !== 'fixed' && isAdmin && (
                      <IconButton size="small" onClick={() => navigate(`/products/${product.id}/price-matrix`)} title="Price Matrix">
                        <GridOnIcon fontSize="small" />
                      </IconButton>
                    )}
                    {isAdmin && (
                      <>
                        <IconButton size="small" onClick={() => openEdit(product)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => setDeleting(product)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {(productsQuery.data ?? []).length === 0 && <EmptyState colSpan={5} message="No products yet." />}
            </TableBody>
          </Table>
        )}
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <form onSubmit={handleSubmit((data) => saveMutation.mutate(data))}>
          <DialogTitle>{editing ? 'Edit Product' : 'Add Product'}</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField label="Name" required fullWidth autoFocus {...register('name', { required: true })} />
              <Controller
                name="category_id"
                control={control}
                render={({ field }) => (
                  <EntitySelect
                    label="Category"
                    mode="list"
                    queryKey="product-category-picker"
                    fetchOptions={productCategoriesApi.list}
                    getOptionLabel={(c) => c.name}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
              <TextField label="Description" fullWidth multiline rows={2} {...register('description')} />
              <TextField label="Pricing Type" select fullWidth {...register('pricing_type')}>
                {PRICING_TYPES.map((t) => (
                  <MenuItem key={t} value={t}>{PRICING_TYPE_LABELS[t]}</MenuItem>
                ))}
              </TextField>
              {pricingType === 'fixed' && (
                <TextField
                  label="Fixed Price"
                  type="number"
                  fullWidth
                  {...register('fixed_price', { valueAsNumber: true })}
                />
              )}
              <Controller
                name="is_active"
                control={control}
                render={({ field }) => (
                  <FormControlLabel
                    control={<Switch checked={field.value ?? true} onChange={(e) => field.onChange(e.target.checked)} />}
                    label="Active"
                  />
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
        title="Delete Product"
        message={`Are you sure you want to delete "${deleting?.name}"? This cannot be undone.`}
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </Box>
  );
}
