import { useEffect, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, FormControlLabel, Switch, Stack } from '@mui/material';
import type { MasterEntity, PricedMasterEntity } from '../../types/common';

interface MasterFormDialogProps {
  open: boolean;
  title: string;
  hasExtraPrice: boolean;
  initialValues?: MasterEntity | PricedMasterEntity | null;
  onSave: (values: { name: string; extra_price?: number; is_active: boolean }) => void;
  onCancel: () => void;
  loading?: boolean;
}

export default function MasterFormDialog({
  open,
  title,
  hasExtraPrice,
  initialValues,
  onSave,
  onCancel,
  loading,
}: MasterFormDialogProps) {
  const [name, setName] = useState('');
  const [extraPrice, setExtraPrice] = useState('0');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (open) {
      setName(initialValues?.name ?? '');
      setExtraPrice(String((initialValues as PricedMasterEntity | undefined)?.extra_price ?? 0));
      setIsActive(initialValues?.is_active ?? true);
    }
  }, [open, initialValues]);

  const handleSave = () => {
    onSave({
      name,
      ...(hasExtraPrice ? { extra_price: parseFloat(extraPrice) || 0 } : {}),
      is_active: isActive,
    });
  };

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required fullWidth autoFocus />
          {hasExtraPrice && (
            <TextField
              label="Extra Price"
              type="number"
              value={extraPrice}
              onChange={(e) => setExtraPrice(e.target.value)}
              fullWidth
            />
          )}
          <FormControlLabel
            control={<Switch checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />}
            label="Active"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button onClick={handleSave} variant="contained" disabled={loading || !name.trim()}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
