import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Autocomplete, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton,
  MenuItem, Paper, Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { productsApi } from '../../api/productsApi';
import { getErrorMessage } from '../../utils/api';
import type { Product, ProductPricingType } from '../../types/products';
import ConfirmDialog from '../ConfirmDialog';

interface Form {
  name: string;
  sub_category: string;
  pricing_type: ProductPricingType;
  fixed_price: string;
  min_quantity: string;
  description: string;
  is_active: boolean;
}

const blank: Form = { name: '', sub_category: '', pricing_type: 'matrix', fixed_price: '', min_quantity: '', description: '', is_active: true };
const PRICE_TYPE_LABEL: Record<string, string> = { matrix: 'By quantity slab', fixed: 'Fixed price', per_area: 'Per sq ft' };

/**
 * The items (sizes / variants) of a service and their SUB-CATEGORY. Items sharing a sub-category are grouped in the order
 * form: the counter picks the sub-category first and then the item, e.g. Rubber Stamp > Polymer Stamp - A Series > A5 (25x12).
 */
export default function ItemsPanel({ categoryId }: { categoryId: number }) {
  const queryClient = useQueryClient();
  const productsQuery = useQuery({ queryKey: ['products'], queryFn: productsApi.list });
  const items = useMemo(() => (productsQuery.data ?? []).filter((p) => p.category_id === categoryId), [productsQuery.data, categoryId]);
  const subCategories = useMemo(() => Array.from(new Set(items.map((p) => p.sub_category).filter((s): s is string => Boolean(s)))).sort(), [items]);

  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(blank);
  const [deleting, setDeleting] = useState<Product | null>(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['product-picker'] });
  };
  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name.trim(),
        category_id: categoryId,
        sub_category: form.sub_category.trim() || null,
        pricing_type: form.pricing_type,
        fixed_price: form.pricing_type === 'fixed' && form.fixed_price.trim() !== '' ? Number(form.fixed_price) : null,
        min_quantity: form.min_quantity.trim() !== '' ? Math.max(1, Math.floor(Number(form.min_quantity))) : null,
        description: form.description.trim() || null,
        is_active: form.is_active,
      };
      return editing ? productsApi.update(editing.id, body) : productsApi.create(body);
    },
    onSuccess: () => { refresh(); setOpen(false); },
  });
  const remove = useMutation({
    mutationFn: (id: number) => productsApi.remove(id),
    onSuccess: () => { refresh(); setDeleting(null); },
  });
  const toggle = useMutation({ mutationFn: (p: Product) => productsApi.update(p.id, { is_active: !p.is_active }), onSuccess: refresh });

  const openCreate = () => { setEditing(null); setForm(blank); save.reset(); setOpen(true); };
  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name, sub_category: p.sub_category ?? '', pricing_type: p.pricing_type, fixed_price: p.fixed_price != null ? String(p.fixed_price) : '',
      min_quantity: p.min_quantity != null ? String(p.min_quantity) : '', description: p.description ?? '', is_active: p.is_active,
    });
    save.reset();
    setOpen(true);
  };

  const shown = items.filter((p) => `${p.name} ${p.sub_category ?? ''}`.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <Box data-testid="items-panel">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Items and sub-categories</Typography>
          <Typography variant="body2" color="text.secondary">
            Give items the same sub-category to group them: the order form then asks for the sub-category first and the item next.
            {subCategories.length > 0 && ` Now: ${subCategories.length} sub-categor${subCategories.length > 1 ? 'ies' : 'y'}.`}
          </Typography>
        </Box>
        <TextField size="small" placeholder="Search items..." value={filter} onChange={(e) => setFilter(e.target.value)} sx={{ width: 220 }} slotProps={{ htmlInput: { 'data-testid': 'items-search' } }} />
        <Button variant="contained" startIcon={<AddIcon />} sx={{ bgcolor: '#1a237e' }} onClick={openCreate} data-testid="item-add">Add item</Button>
      </Box>
      <Paper sx={{ borderRadius: 2, overflowX: 'auto' }}>
        {productsQuery.isLoading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Item / size</TableCell><TableCell>Sub-category</TableCell><TableCell>Price</TableCell>
                <TableCell>Minimum</TableCell><TableCell>Active</TableCell><TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {shown.map((p) => (
                <TableRow key={p.id} hover data-testid="item-row">
                  <TableCell>{p.name}</TableCell>
                  <TableCell>{p.sub_category ? <Chip size="small" label={p.sub_category} /> : <Typography variant="caption" color="text.secondary">-</Typography>}</TableCell>
                  <TableCell>{p.pricing_type === 'fixed' ? (p.fixed_price != null ? `₹${p.fixed_price}` : 'not set') : PRICE_TYPE_LABEL[p.pricing_type] ?? p.pricing_type}</TableCell>
                  <TableCell>{p.min_quantity ?? '-'}</TableCell>
                  <TableCell><Switch size="small" checked={p.is_active} onChange={() => toggle.mutate(p)} slotProps={{ input: { 'aria-label': `Active ${p.name}` } }} /></TableCell>
                  <TableCell align="right">
                    <IconButton size="small" aria-label={`Edit ${p.name}`} onClick={() => openEdit(p)}><EditIcon fontSize="small" /></IconButton>
                    <IconButton size="small" aria-label={`Delete ${p.name}`} onClick={() => setDeleting(p)}><DeleteIcon fontSize="small" /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {shown.length === 0 && (
                <TableRow><TableCell colSpan={6} align="center" sx={{ color: 'text.secondary', py: 3 }}>No items{filter ? ' match' : ' yet'}.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Paper>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{editing ? 'Edit item' : 'Add item'}</DialogTitle>
        <DialogContent>
          {save.isError && <Alert severity="error" sx={{ mb: 2 }}>{getErrorMessage(save.error, 'Could not save the item')}</Alert>}
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Item / size name" required fullWidth autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} slotProps={{ htmlInput: { 'data-testid': 'item-name' } }} />
            <Autocomplete
              freeSolo options={subCategories} value={form.sub_category} inputValue={form.sub_category}
              onInputChange={(_, v) => setForm((f) => ({ ...f, sub_category: v }))}
              renderInput={(params) => (
                <TextField {...params} label="Sub-category (optional)" helperText="Pick one or type a new one, e.g. Polymer Stamp, Dater Stamp"
                  slotProps={{ ...params.slotProps, htmlInput: { ...params.slotProps.htmlInput, 'data-testid': 'item-subcat' } }} />
              )}
            />
            <TextField select label="How it is priced" fullWidth value={form.pricing_type} onChange={(e) => setForm({ ...form, pricing_type: e.target.value as ProductPricingType })}>
              {Object.entries(PRICE_TYPE_LABEL).map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
            </TextField>
            {form.pricing_type === 'fixed' && (
              <TextField label="Fixed price (₹)" type="number" fullWidth value={form.fixed_price} onChange={(e) => setForm({ ...form, fixed_price: e.target.value })} slotProps={{ htmlInput: { step: 'any', min: 0, 'data-testid': 'item-price' } }} />
            )}
            <TextField label="Minimum quantity (optional)" type="number" fullWidth value={form.min_quantity} onChange={(e) => setForm({ ...form, min_quantity: e.target.value })} slotProps={{ htmlInput: { min: 1 } }} />
            <TextField label="Note (optional)" fullWidth value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <FormControlLabel control={<Switch checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />} label="Active (shown in the order form)" />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={save.isPending}>Cancel</Button>
          <Button variant="contained" disabled={!form.name.trim() || save.isPending} onClick={() => save.mutate()} data-testid="item-save">Save</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)} title="Delete item" message={`Delete "${deleting?.name}"? Items used in earlier orders cannot be deleted - switch them off instead.`}
        loading={remove.isPending} onConfirm={() => deleting && remove.mutate(deleting.id)} onCancel={() => setDeleting(null)}
      />
      {remove.isError && <Alert severity="error" sx={{ mt: 2 }}>{getErrorMessage(remove.error, 'Could not delete the item')}</Alert>}
    </Box>
  );
}
