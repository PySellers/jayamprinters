import { useEffect, useRef, useState } from 'react';
import { useFormContext, useWatch, Controller } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import {
  Paper, Grid, TextField, IconButton, FormGroup, FormControlLabel, Checkbox,
  Typography, FormHelperText,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { productsApi } from '../../api/productsApi';
import { attributesApi } from '../../api/attributesApi';
import { extraChargesApi } from '../../api/extraChargesApi';
import type { QuotationCreateInput, SelectedOption } from '../../types/quotations';
import EntitySelect from '../pickers/EntitySelect';

interface QuotationLineItemProps {
  index: number;
  onRemove: () => void;
  canRemove: boolean;
}

export default function QuotationLineItem({ index, onRemove, canRemove }: QuotationLineItemProps) {
  const { control, register, setValue, formState: { errors } } = useFormContext<QuotationCreateInput>();

  const productId = useWatch({ control, name: `items.${index}.product_id` });

  const productsQuery = useQuery({ queryKey: ['product-picker', 'list'], queryFn: productsApi.list });
  const product = productsQuery.data?.find((p) => p.id === productId);
  const categoryId = product?.category_id ?? null;

  const attributesQuery = useQuery({
    queryKey: ['attributes', categoryId],
    queryFn: () => attributesApi.list(categoryId),
    enabled: Boolean(categoryId),
  });
  const extraChargesQuery = useQuery({
    queryKey: ['extra-charges', categoryId],
    queryFn: () => extraChargesApi.list(categoryId),
    enabled: Boolean(categoryId),
  });

  const prevProductId = useRef(productId);
  useEffect(() => {
    if (prevProductId.current !== undefined && prevProductId.current !== productId) {
      setValue(`items.${index}.selected_options`, []);
      setValue(`items.${index}.extra_charge_ids`, []);
      setValue(`items.${index}.area_sqft`, undefined);
    }
    prevProductId.current = productId;
  }, [productId, index, setValue]);

  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const area = (parseFloat(width) || 0) * (parseFloat(height) || 0);
  useEffect(() => {
    if (product?.pricing_type === 'per_area') {
      setValue(`items.${index}.area_sqft`, area || undefined);
    }
  }, [area, product?.pricing_type, index, setValue]);

  const itemErrors = errors.items?.[index];

  return (
    <Paper sx={{ p: 3, borderRadius: 2, mb: 2 }}>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 7 }}>
          <Controller
            name={`items.${index}.product_id`}
            control={control}
            rules={{ required: true }}
            render={({ field }) => (
              <EntitySelect
                label="Product"
                required
                mode="list"
                queryKey="product-picker"
                fetchOptions={productsApi.list}
                getOptionLabel={(p) => p.name}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </Grid>
        <Grid size={{ xs: 8, sm: 4 }}>
          <TextField
            label="Qty"
            type="number"
            fullWidth
            size="small"
            error={Boolean(itemErrors?.quantity)}
            {...register(`items.${index}.quantity`, { required: true, valueAsNumber: true, min: 1 })}
          />
        </Grid>
        <Grid size={{ xs: 4, sm: 1 }} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          <IconButton onClick={onRemove} disabled={!canRemove}>
            <DeleteIcon />
          </IconButton>
        </Grid>

        {product && product.pricing_type === 'per_area' && (
          <>
            <Grid size={{ xs: 6, sm: 3 }}>
              <TextField label="Width (ft)" type="number" fullWidth size="small" value={width} onChange={(e) => setWidth(e.target.value)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <TextField label="Height (ft)" type="number" fullWidth size="small" value={height} onChange={(e) => setHeight(e.target.value)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <TextField label="Area (sq.ft)" fullWidth size="small" value={area.toFixed(2)} disabled />
            </Grid>
          </>
        )}

        {product && product.pricing_type !== 'fixed' && (attributesQuery.data ?? []).length > 0 && (
          <Grid size={{ xs: 12 }}>
            <Controller
              name={`items.${index}.selected_options`}
              control={control}
              rules={{
                validate: (value) => {
                  const missing = (attributesQuery.data ?? [])
                    .filter((attr) => attr.is_required)
                    .filter((attr) => !value?.some((v) => v.attribute_id === attr.id));
                  return missing.length === 0 || `Missing required: ${missing.map((a) => a.name).join(', ')}`;
                },
              }}
              render={({ field, fieldState }) => (
                <>
                  <Grid container spacing={2}>
                    {(attributesQuery.data ?? []).map((attr) => {
                      const current = (field.value ?? []).find((v: SelectedOption) => v.attribute_id === attr.id);
                      return (
                        <Grid size={{ xs: 6, sm: 3 }} key={attr.id}>
                          <EntitySelect
                            label={attr.is_required ? `${attr.name} *` : attr.name}
                            mode="list"
                            queryKey={`attribute-option-picker-${attr.id}`}
                            fetchOptions={async () => attr.options}
                            getOptionLabel={(o) => (o.extra_price ? `${o.value} (+₹${o.extra_price.toFixed(2)})` : o.value)}
                            value={current?.attribute_option_id ?? null}
                            onChange={(optionId) => {
                              const withoutThis = (field.value ?? []).filter((v: SelectedOption) => v.attribute_id !== attr.id);
                              const next = optionId == null
                                ? withoutThis
                                : [...withoutThis, { attribute_id: attr.id, attribute_option_id: optionId }];
                              field.onChange(next);
                            }}
                          />
                        </Grid>
                      );
                    })}
                  </Grid>
                  {fieldState.error && <FormHelperText error>{fieldState.error.message}</FormHelperText>}
                </>
              )}
            />
          </Grid>
        )}

        {product && (extraChargesQuery.data ?? []).length > 0 && (
          <Grid size={{ xs: 12 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              Extra Charges
            </Typography>
            <Controller
              name={`items.${index}.extra_charge_ids`}
              control={control}
              render={({ field }) => (
                <FormGroup row>
                  {(extraChargesQuery.data ?? []).map((charge) => (
                    <FormControlLabel
                      key={charge.id}
                      control={
                        <Checkbox
                          checked={(field.value ?? []).includes(charge.id)}
                          onChange={(e) => {
                            const current = field.value ?? [];
                            field.onChange(
                              e.target.checked ? [...current, charge.id] : current.filter((id: number) => id !== charge.id)
                            );
                          }}
                        />
                      }
                      label={`${charge.name} (+₹${charge.amount.toFixed(2)} ${charge.charge_type.replace('_', ' ')})`}
                    />
                  ))}
                </FormGroup>
              )}
            />
          </Grid>
        )}
      </Grid>
    </Paper>
  );
}
