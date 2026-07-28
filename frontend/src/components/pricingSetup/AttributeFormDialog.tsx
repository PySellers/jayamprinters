import { useEffect, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, FormControlLabel, Switch, Stack } from '@mui/material';
import type { Attribute, AttributeInput } from '../../types/attributes';

interface AttributeFormDialogProps {
  open: boolean;
  title: string;
  initialValues?: Attribute | null;
  onSave: (values: Omit<AttributeInput, 'category_id'>) => void;
  onCancel: () => void;
  loading?: boolean;
}

export default function AttributeFormDialog({ open, title, initialValues, onSave, onCancel, loading }: AttributeFormDialogProps) {
  const [name, setName] = useState('');
  const [isRequired, setIsRequired] = useState(false);
  const [displayOrder, setDisplayOrder] = useState('0');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (open) {
      setName(initialValues?.name ?? '');
      setIsRequired(initialValues?.is_required ?? false);
      setDisplayOrder(String(initialValues?.display_order ?? 0));
      setIsActive(initialValues?.is_active ?? true);
    }
  }, [open, initialValues]);

  const handleSave = () => {
    onSave({
      name,
      is_required: isRequired,
      display_order: parseInt(displayOrder, 10) || 0,
      is_active: isActive,
    });
  };

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required fullWidth autoFocus />
          <TextField label="Display Order" type="number" value={displayOrder} onChange={(e) => setDisplayOrder(e.target.value)} fullWidth />
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
