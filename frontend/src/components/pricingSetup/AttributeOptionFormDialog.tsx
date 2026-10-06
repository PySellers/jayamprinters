import { useEffect, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, FormControlLabel, Switch, Stack } from '@mui/material';
import type { AttributeOption, AttributeOptionInput } from '../../types/attributes';

interface AttributeOptionFormDialogProps {
  open: boolean;
  title: string;
  initialValues?: AttributeOption | null;
  onSave: (values: AttributeOptionInput) => void;
  onCancel: () => void;
  loading?: boolean;
}

export default function AttributeOptionFormDialog({ open, title, initialValues, onSave, onCancel, loading }: AttributeOptionFormDialogProps) {
  const [value, setValue] = useState('');
  const [extraPrice, setExtraPrice] = useState('0');
  const [displayOrder, setDisplayOrder] = useState('0');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (open) {
      setValue(initialValues?.value ?? '');
      setExtraPrice(String(initialValues?.extra_price ?? 0));
      setDisplayOrder(String(initialValues?.display_order ?? 0));
      setIsActive(initialValues?.is_active ?? true);
    }
  }, [open, initialValues]);

  const handleSave = () => {
    onSave({
      value,
      extra_price: parseFloat(extraPrice) || 0,
      display_order: parseInt(displayOrder, 10) || 0,
      is_active: isActive,
    });
  };

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Value" value={value} onChange={(e) => setValue(e.target.value)} required fullWidth autoFocus />
          <TextField label="Extra Price" type="number" value={extraPrice} onChange={(e) => setExtraPrice(e.target.value)} fullWidth />
          <TextField label="Display Order" type="number" value={displayOrder} onChange={(e) => setDisplayOrder(e.target.value)} fullWidth />
          <FormControlLabel control={<Switch checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />} label="Active" />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={loading}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={loading || !value.trim()}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}
