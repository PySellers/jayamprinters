import { useEffect, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Stack } from '@mui/material';
import type { QuantitySlab, QuantitySlabInput } from '../../types/quantitySlabs';

interface QuantitySlabFormDialogProps {
  open: boolean;
  title: string;
  initialValues?: QuantitySlab | null;
  onSave: (values: Omit<QuantitySlabInput, 'category_id'>) => void;
  onCancel: () => void;
  loading?: boolean;
}

export default function QuantitySlabFormDialog({ open, title, initialValues, onSave, onCancel, loading }: QuantitySlabFormDialogProps) {
  const [minQuantity, setMinQuantity] = useState('1');
  const [maxQuantity, setMaxQuantity] = useState('');
  const [label, setLabel] = useState('');
  const [displayOrder, setDisplayOrder] = useState('0');

  useEffect(() => {
    if (open) {
      setMinQuantity(String(initialValues?.min_quantity ?? 1));
      setMaxQuantity(initialValues?.max_quantity != null ? String(initialValues.max_quantity) : '');
      setLabel(initialValues?.label ?? '');
      setDisplayOrder(String(initialValues?.display_order ?? 0));
    }
  }, [open, initialValues]);

  const handleSave = () => {
    onSave({
      min_quantity: parseInt(minQuantity, 10) || 1,
      max_quantity: maxQuantity.trim() === '' ? null : parseInt(maxQuantity, 10),
      label: label.trim() === '' ? null : label,
      display_order: parseInt(displayOrder, 10) || 0,
    });
  };

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Min Quantity" type="number" value={minQuantity} onChange={(e) => setMinQuantity(e.target.value)} required fullWidth autoFocus />
          <TextField
            label="Max Quantity"
            type="number"
            value={maxQuantity}
            onChange={(e) => setMaxQuantity(e.target.value)}
            fullWidth
            helperText="Leave blank for unbounded"
          />
          <TextField label="Label" value={label} onChange={(e) => setLabel(e.target.value)} fullWidth placeholder='e.g. "1st 1000 nos"' />
          <TextField label="Display Order" type="number" value={displayOrder} onChange={(e) => setDisplayOrder(e.target.value)} fullWidth />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={loading}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={loading}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}
