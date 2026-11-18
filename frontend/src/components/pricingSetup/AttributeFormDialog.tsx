import { useEffect, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, FormControlLabel, Switch, Stack, MenuItem } from '@mui/material';
import type { Attribute, AttributeInput } from '../../types/attributes';

interface AttributeFormDialogProps {
  open: boolean;
  title: string;
  initialValues?: Attribute | null;
  /** The items of the service, so a drop-down can be limited to one of them. */
  items?: { id: number; name: string }[];
  onSave: (values: Omit<AttributeInput, 'category_id'>) => void;
  onCancel: () => void;
  loading?: boolean;
}

export default function AttributeFormDialog({ open, title, initialValues, items = [], onSave, onCancel, loading }: AttributeFormDialogProps) {
  const [name, setName] = useState('');
  const [isRequired, setIsRequired] = useState(false);
  const [displayOrder, setDisplayOrder] = useState('0');
  const [isActive, setIsActive] = useState(true);
  const [productId, setProductId] = useState<number | ''>('');

  useEffect(() => {
    if (open) {
      setName(initialValues?.name ?? '');
      setIsRequired(initialValues?.is_required ?? false);
      setDisplayOrder(String(initialValues?.display_order ?? 0));
      setIsActive(initialValues?.is_active ?? true);
      setProductId(initialValues?.product_id ?? '');
    }
  }, [open, initialValues]);

  const handleSave = () => {
    onSave({
      name,
      is_required: isRequired,
      display_order: parseInt(displayOrder, 10) || 0,
      is_active: isActive,
      product_id: productId === '' ? null : productId,
    });
  };

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required fullWidth autoFocus />
          <TextField label="Display Order" type="number" value={displayOrder} onChange={(e) => setDisplayOrder(e.target.value)} fullWidth />
          {items.length > 1 && (
            <TextField select label="Shown for" value={productId} onChange={(e) => setProductId(e.target.value === '' ? '' : Number(e.target.value))} fullWidth
              helperText="All items of the service, or only one of them (e.g. a Size list for one invitation type).">
              <MenuItem value="">All items of the service</MenuItem>
              {items.map((it) => <MenuItem key={it.id} value={it.id}>Only: {it.name}</MenuItem>)}
            </TextField>
          )}
          <FormControlLabel control={<Switch checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} />} label="Required" />
          <FormControlLabel control={<Switch checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />} label="Active" />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={loading}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={loading || !name.trim()}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}
