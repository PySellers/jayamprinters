import { useEffect, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, MenuItem, FormControlLabel, Switch, Checkbox, Stack } from '@mui/material';
import type { ChargeType, ExtraCharge, ExtraChargeInput } from '../../types/extraCharges';

const CHARGE_TYPES: ChargeType[] = ['flat', 'per_unit', 'per_sqft', 'percentage'];

interface ExtraChargeFormDialogProps {
  open: boolean;
  title: string;
  initialValues?: ExtraCharge | null;
  onSave: (values: Omit<ExtraChargeInput, 'category_id'> & { global: boolean }) => void;
  onCancel: () => void;
  loading?: boolean;
}

export default function ExtraChargeFormDialog({ open, title, initialValues, onSave, onCancel, loading }: ExtraChargeFormDialogProps) {
  const [name, setName] = useState('');
  const [chargeType, setChargeType] = useState<ChargeType>('flat');
  const [amount, setAmount] = useState('0');
  const [isActive, setIsActive] = useState(true);
  const [global, setGlobal] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initialValues?.name ?? '');
      setChargeType(initialValues?.charge_type ?? 'flat');
      setAmount(String(initialValues?.amount ?? 0));
      setIsActive(initialValues?.is_active ?? true);
      setGlobal(initialValues ? initialValues.category_id === null : false);
    }
  }, [open, initialValues]);

  const handleSave = () => {
    onSave({
      name,
      charge_type: chargeType,
      amount: parseFloat(amount) || 0,
      is_active: isActive,
      global,
    });
  };

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required fullWidth autoFocus />
          <TextField label="Charge Type" select fullWidth value={chargeType} onChange={(e) => setChargeType(e.target.value as ChargeType)}>
            {CHARGE_TYPES.map((t) => (
              <MenuItem key={t} value={t}>{t.replace('_', ' ')}</MenuItem>
            ))}
          </TextField>
          <TextField label="Amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} fullWidth />
          <FormControlLabel
            control={<Checkbox checked={global} onChange={(e) => setGlobal(e.target.checked)} />}
            label="Apply to all categories (global)"
          />
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
