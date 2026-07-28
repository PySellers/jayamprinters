import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
  FormControlLabel, Switch, Stack, Alert,
} from '@mui/material';
import { attributesApi } from '../../api/attributesApi';
import { quantitySlabsApi } from '../../api/quantitySlabsApi';
import type { PriceMatrixCell, PriceMatrixCellInput } from '../../types/priceMatrix';
import type { SelectedOption } from '../../types/quotations';
import EntitySelect from '../pickers/EntitySelect';

interface PriceMatrixCellFormDialogProps {
  open: boolean;
  title: string;
  categoryId: number | null;
  initialValues?: PriceMatrixCell | null;
  onSave: (values: Omit<PriceMatrixCellInput, 'product_id'>) => void;
  onCancel: () => void;
  loading?: boolean;
}

export default function PriceMatrixCellFormDialog({
  open, title, categoryId, initialValues, onSave, onCancel, loading,
}: PriceMatrixCellFormDialogProps) {
  const [quantitySlabId, setQuantitySlabId] = useState<number | null>(null);
  const [unitPrice, setUnitPrice] = useState('0');
  const [isActive, setIsActive] = useState(true);
  const [selections, setSelections] = useState<Record<number, number | null>>({});

  const attributesQuery = useQuery({
    queryKey: ['attributes', categoryId],
    queryFn: () => attributesApi.list(categoryId),
    enabled: open && Boolean(categoryId),
  });

  useEffect(() => {
    if (!open) return;
    setQuantitySlabId(initialValues?.quantity_slab_id ?? null);
    setUnitPrice(String(initialValues?.unit_price ?? 0));
    setIsActive(initialValues?.is_active ?? true);
    const initialSelections: Record<number, number | null> = {};
    (initialValues?.options ?? []).forEach((opt) => {
      initialSelections[opt.attribute_id] = opt.attribute_option_id;
    });
    setSelections(initialSelections);
  }, [open, initialValues]);

  const handleSave = () => {
    const options: SelectedOption[] = Object.entries(selections)
      .filter(([, optionId]) => optionId != null)
      .map(([attributeId, optionId]) => ({
        attribute_id: Number(attributeId),
        attribute_option_id: optionId as number,
      }));
    onSave({
      quantity_slab_id: quantitySlabId!,
      unit_price: parseFloat(unitPrice) || 0,
      is_active: isActive,
      options,
    });
  };

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Alert severity="warning">
            Only attributes you set below become part of this rule — a quotation line matches this cell only if it
            selects exactly this set of attribute values, no more, no fewer. Leave an attribute blank if this price
            doesn't depend on it.
          </Alert>

          <EntitySelect
            label="Quantity Slab"
            required
            mode="list"
            queryKey={`quantity-slab-picker-${categoryId}`}
            fetchOptions={() => quantitySlabsApi.list(categoryId)}
            getOptionLabel={(s) => `${s.min_quantity} – ${s.max_quantity ?? '∞'}${s.label ? ` (${s.label})` : ''}`}
            value={quantitySlabId}
            onChange={setQuantitySlabId}
          />

          {(attributesQuery.data ?? []).map((attr) => (
            <EntitySelect
              key={attr.id}
              label={attr.name}
              mode="list"
              queryKey={`attribute-option-picker-${attr.id}`}
              fetchOptions={async () => attr.options}
              getOptionLabel={(o) => o.extra_price ? `${o.value} (+₹${o.extra_price.toFixed(2)})` : o.value}
              value={selections[attr.id] ?? null}
              onChange={(value) => setSelections((prev) => ({ ...prev, [attr.id]: value }))}
            />
          ))}

          <TextField label="Unit Price" type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} required fullWidth />
          <FormControlLabel control={<Switch checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />} label="Active" />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={loading}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={loading || !quantitySlabId}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}
