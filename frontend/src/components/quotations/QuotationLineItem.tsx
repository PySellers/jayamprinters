import { useEffect, useRef, useState } from 'react';
import { useFormContext, useWatch, Controller } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { Paper, Grid, TextField, IconButton, Typography, FormHelperText } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { productsApi, productCategoriesApi } from '../../api/productsApi';
import { attributesApi } from '../../api/attributesApi';
import { extraChargesApi } from '../../api/extraChargesApi';
import type { QuotationCreateInput, SelectedOption } from '../../types/quotations';
import EntitySelect from '../pickers/EntitySelect';
import ChargeGroupPicker, { pruneCharges } from './ChargeGroupPicker';

interface QuotationLineItemProps {
  index: number;
  onRemove: () => void;
  canRemove: boolean;
  /** Live-computed rate/amount for this line (from POST /quotations/preview).
   * Omit to render the plain form with no price readout, as on the regular
   * quotation-builder page -- only the billing-counter screen passes this. */
  previewItem?: { unit_price: number; total_price: number; priceable: boolean };
}

export default function QuotationLineItem({ index, onRemove, canRemove, previewItem }: QuotationLineItemProps) {
  const { control, register, setValue, formState: { errors } } = useFormContext<QuotationCreateInput>();

  const productId = useWatch({ control, name: `items.${index}.product_id` });

  const productsQuery = useQuery({ queryKey: ['product-picker', 'list'], queryFn: productsApi.list });
  const product = productsQuery.data?.find((p) => p.id === productId);
  const categoryId = product?.category_id ?? null;

  // Two-level pick: Service (category) first, then the exact item within it, so the
  // list never repeats a service once per size/variant.
  const [serviceId, setServiceId] = useState<number | null>(null);
  useEffect(() => {
    if (serviceId == null && categoryId != null) setServiceId(categoryId);
  }, [categoryId, serviceId]);

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

  const selectedOptions = useWatch({ control, name: `items.${index}.selected_options` });
  const chargeIds = useWatch({ control, name: `items.${index}.extra_charge_ids` });
  const selectedOptionIds = (selectedOptions ?? []).map((o) => o.attribute_option_id);

  // Drop dependent charges (e.g. a binding-set price) once the option they need is deselected.
  useEffect(() => {
    const current = chargeIds ?? [];
    const pruned = pruneCharges(current, extraChargesQuery.data ?? [], selectedOptionIds);
    if (pruned.length !== current.length) setValue(`items.${index}.extra_charge_ids`, pruned);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOptionIds.join(','), extraChargesQuery.data]);

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
        <Grid size={{ xs: 12, sm: 4 }}>
          <EntitySelect
            label="Service"
            required
            mode="list"
            queryKey="service-picker"
            fetchOptions={async () => (await productCategoriesApi.list()).filter((c) => c.is_active)}
            getOptionLabel={(c) => c.name}
            value={serviceId}
            onChange={(id) => {
              setServiceId(id);
              if (id !== categoryId) setValue(`items.${index}.product_id`, 0);
            }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Controller
            name={`items.${index}.product_id`}
            control={control}
            rules={{ validate: (v) => Number(v) > 0 || 'Choose an item' }}
            render={({ field }) => (
              <EntitySelect
                label="Item / Size"
                required
                mode="list"
                queryKey={`product-picker-${serviceId ?? 'none'}`}
                fetchOptions={async () =>
                  (await productsApi.list()).filter((p) => p.is_active && p.category_id === serviceId)
                }
                getOptionLabel={(p) => p.name}
                value={field.value || null}
                onChange={(id) => field.onChange(id ?? 0)}
                disabled={serviceId == null}
              />
            )}
          />
        </Grid>
        <Grid size={{ xs: 8, sm: 3 }}>
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

        {previewItem && (
          <Grid size={{ xs: 12 }} sx={{ display: 'flex', justifyContent: 'flex-end', gap: 3, py: 0.5 }}>
            {previewItem.priceable ? (
              <>
                <Typography variant="body2" color="text.secondary">
                  Rate: <strong>₹{previewItem.unit_price.toFixed(2)}</strong>
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                  Amount: ₹{previewItem.total_price.toFixed(2)}
                </Typography>
              </>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {product ? 'Select all required options to see the price' : ''}
              </Typography>
            )}
          </Grid>
        )}

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
            <Controller
              name={`items.${index}.extra_charge_ids`}
              control={control}
              render={({ field }) => (
                <ChargeGroupPicker
                  charges={extraChargesQuery.data ?? []}
                  value={field.value ?? []}
                  onChange={field.onChange}
                  selectedOptionIds={selectedOptionIds}
                />
              )}
            />
          </Grid>
        )}
      </Grid>
    </Paper>
  );
}
