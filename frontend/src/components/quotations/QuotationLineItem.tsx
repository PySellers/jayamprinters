import { useEffect, useRef, useState } from 'react';
import { useFormContext, useWatch, Controller } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { Box, Paper, Grid, TextField, IconButton, Typography, FormHelperText, Chip } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { productsApi, productCategoriesApi } from '../../api/productsApi';
import { attributesApi } from '../../api/attributesApi';
import { extraChargesApi } from '../../api/extraChargesApi';
import type { QuotationCreateInput, QuotationPreviewItem, SelectedOption } from '../../types/quotations';
import EntitySelect from '../pickers/EntitySelect';
import ChargeGroupPicker, { pruneCharges, unansweredSections } from './ChargeGroupPicker';
import { RateInfo } from './PriceBreakdown';

interface QuotationLineItemProps {
  index: number;
  onRemove: () => void;
  canRemove: boolean;
  /** Live-computed rate/amount for this line (from POST /quotations/preview).
   * Omit to render the plain form with no price readout, as on the regular
   * quotation-builder page -- only the billing-counter screen passes this. */
  previewItem?: QuotationPreviewItem;
  /** The service was already chosen on the dashboard: show it as a heading instead of asking again. */
  lockedServiceId?: number | null;
  /** Show the "extras need an answer" errors (after a failed submit). */
  showErrors?: boolean;
}

const money = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function QuotationLineItem({ index, onRemove, canRemove, previewItem, lockedServiceId = null, showErrors }: QuotationLineItemProps) {
  const { control, register, setValue, formState: { errors } } = useFormContext<QuotationCreateInput>();

  const productId = useWatch({ control, name: `items.${index}.product_id` });
  const quantity = useWatch({ control, name: `items.${index}.quantity` });

  const productsQuery = useQuery({ queryKey: ['product-picker', 'list'], queryFn: productsApi.list });
  const categoriesQuery = useQuery({ queryKey: ['product-categories'], queryFn: productCategoriesApi.list });
  const product = productsQuery.data?.find((p) => p.id === productId);
  const categoryId = product?.category_id ?? lockedServiceId ?? null;
  const category = categoriesQuery.data?.find((c) => c.id === categoryId);

  // Two-level pick: Service (category) first, then the exact item within it, so the
  // list never repeats a service once per size/variant.
  const [serviceId, setServiceId] = useState<number | null>(lockedServiceId);
  // sub-category of the item (Rubber Stamp: Polymer Stamp - A Series ...): asked before the item when the service has any
  const [subCategory, setSubCategory] = useState<string>('');
  useEffect(() => {
    if (serviceId == null && categoryId != null) setServiceId(categoryId);
  }, [categoryId, serviceId]);

  // A service with a single item has nothing to choose between: the item is picked for the counter.
  const itemsOfService = (productsQuery.data ?? []).filter((p) => p.is_active && p.category_id === serviceId);
  const namedSubs = Array.from(new Set(itemsOfService.map((p) => p.sub_category).filter((s): s is string => Boolean(s)))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const hasSubCategories = namedSubs.length > 0;
  // items without a sub-category are listed under "Other" so none is hidden
  const subCategories = hasSubCategories && itemsOfService.some((p) => !p.sub_category) ? [...namedSubs, 'Other'] : namedSubs;
  const inSub = (p: { sub_category?: string | null }) => (subCategory === 'Other' ? !p.sub_category : (p.sub_category ?? '') === subCategory);
  // when the chosen item already has a sub-category (e.g. an order being edited) show it
  useEffect(() => {
    if (product && hasSubCategories && !subCategory) setSubCategory(product.sub_category || 'Other');
  }, [product?.id, hasSubCategories]); // eslint-disable-line react-hooks/exhaustive-deps
  const singleItem = itemsOfService.length === 1 ? itemsOfService[0] : null;
  useEffect(() => {
    if (singleItem && !productId) setValue(`items.${index}.product_id`, singleItem.id);
  }, [singleItem?.id, productId, index, setValue]); // eslint-disable-line react-hooks/exhaustive-deps

  const attributesQuery = useQuery({
    queryKey: ['attributes', categoryId],
    queryFn: () => attributesApi.list(categoryId),
    enabled: Boolean(categoryId),
  });
  // Paper first: the paper (name, board, GSM, paper size) decides most of the price, so it is asked before the other options.
  const isPaperAttr = (name: string) => /paper|board|gsm|stock|media|material/i.test(name);
  const activeAttributes = (attributesQuery.data ?? [])
    .filter((a) => a.is_active)
    .map((a, i) => ({ a, i }))
    .sort((x, y) => Number(isPaperAttr(y.a.name)) - Number(isPaperAttr(x.a.name)) || x.i - y.i)
    .map((x) => x.a);
  const extraChargesQuery = useQuery({
    queryKey: ['extra-charges', categoryId],
    queryFn: () => extraChargesApi.list(categoryId),
    enabled: Boolean(categoryId),
  });

  const selectedOptions = useWatch({ control, name: `items.${index}.selected_options` });
  const chargeIds = useWatch({ control, name: `items.${index}.extra_charge_ids` });
  const customCharges = useWatch({ control, name: `items.${index}.custom_charges` });
  const extrasChoices = useWatch({ control, name: `items.${index}.extras_choices` });
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
      setValue(`items.${index}.custom_charges`, []);
      setValue(`items.${index}.extras_choices`, {});
      setValue(`items.${index}.area_sqft`, undefined);
    }
    prevProductId.current = productId;
  }, [productId, index, setValue]);

  // The service's smallest order (e.g. 50 visiting cards): start there and keep the counter informed.
  const minQty = product?.min_quantity ?? null;
  useEffect(() => {
    if (minQty && (Number(quantity) || 0) < minQty && productId) setValue(`items.${index}.quantity`, minQty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minQty, productId]);

  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const area = (parseFloat(width) || 0) * (parseFloat(height) || 0);
  useEffect(() => {
    if (product?.pricing_type === 'per_area') {
      setValue(`items.${index}.area_sqft`, area || undefined);
    }
  }, [area, product?.pricing_type, index, setValue]);

  // Services priced per copy (binding, front sheet...) ask for pages per set x number of sets
  // instead of one quantity; the total pages drive the quantity band, sets drive per-set charges.
  const usesSets = (extraChargesQuery.data ?? []).some((c) => c.is_active && c.charge_type === 'per_set');
  const [pagesPerSet, setPagesPerSet] = useState('1');
  const [setCount, setSetCount] = useState('1');
  const pagesN = Math.max(1, parseInt(pagesPerSet, 10) || 1);
  const setsN = Math.max(1, parseInt(setCount, 10) || 1);
  useEffect(() => {
    if (usesSets) {
      setValue(`items.${index}.quantity`, pagesN * setsN);
      setValue(`items.${index}.sets`, setsN);
      setValue(`items.${index}.spec_notes`, `${pagesN} pages x ${setsN} set${setsN > 1 ? 's' : ''}`);
    } else {
      setValue(`items.${index}.sets`, 1);
    }
  }, [usesSets, pagesN, setsN, index, setValue]);

  const itemErrors = errors.items?.[index];
  const required = Boolean(category?.extras_required);
  const serviceName = category?.name ?? categoriesQuery.data?.find((c) => c.id === lockedServiceId)?.name ?? '';
  const missingExtras = required ? unansweredSections(extraChargesQuery.data ?? [], selectedOptionIds, extrasChoices) : [];

  return (
    <Paper sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 2, mb: 2 }}>
      <Grid container spacing={2}>
        {lockedServiceId != null ? (
          <Grid size={{ xs: 12 }} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Typography variant="h6" sx={{ fontWeight: 800, color: '#1a237e' }}>{serviceName}</Typography>
            {singleItem && singleItem.name !== serviceName && <Chip size="small" label={singleItem.name} />}
            {product?.description && <Typography variant="body2" color="text.secondary">{product.description}</Typography>}
          </Grid>
        ) : (
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
        )}
        {/* the sub-category comes first (only for services that have them), then the item / size */}
        {hasSubCategories && (
          <Grid size={{ xs: 12, sm: lockedServiceId != null ? 4 : 4 }}>
            <EntitySelect
              label="Sub-category"
              required
              mode="list"
              queryKey={`subcat-picker-${serviceId ?? 'none'}-${subCategories.join('|')}`}
              fetchOptions={async () => subCategories.map((name, id) => ({ id: id + 1, name }))}
              getOptionLabel={(o) => o.name}
              value={subCategory ? subCategories.indexOf(subCategory) + 1 : null}
              onChange={(id) => {
                const next = id ? subCategories[id - 1] : '';
                setSubCategory(next);
                if (product && !(next === 'Other' ? !product.sub_category : product.sub_category === next)) setValue(`items.${index}.product_id`, 0);
              }}
            />
          </Grid>
        )}
        {/* the item / size is only asked when the service has more than one */}
        {!singleItem && (
          <Grid size={{ xs: 12, sm: lockedServiceId != null ? (hasSubCategories ? 4 : 6) : 4 }}>
            <Controller
              name={`items.${index}.product_id`}
              control={control}
              rules={{ validate: (v) => Number(v) > 0 || 'Choose an item' }}
              render={({ field }) => (
                <EntitySelect
                  label="Item / Size"
                  required
                  mode="list"
                  queryKey={`product-picker-${serviceId ?? 'none'}-${subCategory}`}
                  fetchOptions={async () => (await productsApi.list()).filter((p) => p.is_active && p.category_id === serviceId && (!hasSubCategories || inSub(p)))}
                  getOptionLabel={(p) => p.name}
                  value={field.value || null}
                  onChange={(id) => field.onChange(id ?? 0)}
                  disabled={serviceId == null || (hasSubCategories && !subCategory)}
                />
              )}
            />
          </Grid>
        )}
        <Grid size={{ xs: 8, sm: 3 }}>
          {usesSets ? (
            <>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField label="Pages / set" type="number" size="small" value={pagesPerSet} onChange={(e) => setPagesPerSet(e.target.value)} slotProps={{ htmlInput: { min: 1 } }} />
                <TextField label="Sets" type="number" size="small" value={setCount} onChange={(e) => setSetCount(e.target.value)} slotProps={{ htmlInput: { min: 1 } }} />
              </Box>
              <Typography variant="caption" color="text.secondary">
                Total: {(pagesN * setsN).toLocaleString('en-IN')} pages
              </Typography>
            </>
          ) : (
            <TextField
              label="Qty"
              type="number"
              fullWidth
              size="small"
              error={Boolean(itemErrors?.quantity) || Boolean(previewItem?.message)}
              helperText={previewItem?.message ?? (minQty ? `Minimum order ${minQty.toLocaleString('en-IN')}` : undefined)}
              slotProps={{ htmlInput: { min: minQty ?? 1 } }}
              {...register(`items.${index}.quantity`, {
                required: true, valueAsNumber: true,
                min: { value: minQty ?? 1, message: `Minimum order is ${minQty ?? 1}` },
              })}
            />
          )}
        </Grid>
        <Grid size={{ xs: 4, sm: 1 }} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', ml: 'auto' }}>
          <IconButton aria-label="Remove line" onClick={onRemove} disabled={!canRemove}>
            <DeleteIcon />
          </IconButton>
        </Grid>

        {previewItem && (
          <Grid size={{ xs: 12 }} sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 2, py: 0.5, flexWrap: 'wrap' }}>
            {previewItem.priceable ? (
              <>
                <Typography variant="body2" color="text.secondary">
                  Rate: <strong data-testid="line-rate">₹{money(previewItem.unit_price)}</strong>
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 'bold' }} data-testid="line-amount">
                  Amount: ₹{money(previewItem.total_price)}
                </Typography>
                <RateInfo
                  rows={previewItem.breakdown}
                  title={`${serviceName}${product ? ` - ${product.name}` : ''} x ${Number(quantity) || 0}`}
                  rate={previewItem.unit_price}
                  amount={previewItem.total_price}
                  label="Why this rate?"
                />
              </>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {previewItem.message ? '' : product ? 'Select all required options to see the price' : ''}
              </Typography>
            )}
          </Grid>
        )}

        {product && product.pricing_type === 'per_area' && (
          <>
            <Grid size={{ xs: 6, sm: 3 }}>
              <TextField label="Width (ft)" type="number" slotProps={{ htmlInput: { step: 'any' } }} fullWidth size="small" value={width} onChange={(e) => setWidth(e.target.value)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <TextField label="Height (ft)" type="number" slotProps={{ htmlInput: { step: 'any' } }} fullWidth size="small" value={height} onChange={(e) => setHeight(e.target.value)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <TextField label="Area (sq.ft)" fullWidth size="small" value={area.toFixed(2)} disabled />
            </Grid>
          </>
        )}

        {product && product.pricing_type !== 'fixed' && activeAttributes.length > 0 && (
          <Grid size={{ xs: 12 }}>
            <Controller
              name={`items.${index}.selected_options`}
              control={control}
              rules={{
                validate: (value) => {
                  const missing = activeAttributes
                    .filter((attr) => attr.is_required)
                    .filter((attr) => !value?.some((v) => v.attribute_id === attr.id));
                  return missing.length === 0 || `Missing required: ${missing.map((a) => a.name).join(', ')}`;
                },
              }}
              render={({ field, fieldState }) => (
                <>
                  <Grid container spacing={2}>
                    {activeAttributes.map((attr) => {
                      const current = (field.value ?? []).find((v: SelectedOption) => v.attribute_id === attr.id);
                      return (
                        <Grid size={{ xs: 6, sm: 3 }} key={attr.id}>
                          <EntitySelect
                            label={attr.is_required ? `${attr.name} *` : attr.name}
                            mode="list"
                            queryKey={`attribute-option-picker-${attr.id}`}
                            fetchOptions={async () => attr.options.filter((o) => o.is_active)}
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
            {required && (
              <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#1a237e', mb: 1 }}>
                Extras - choose for each (None if the customer does not want it)
              </Typography>
            )}
            <Controller
              name={`items.${index}.extra_charge_ids`}
              control={control}
              rules={{ validate: () => missingExtras.length === 0 || `Choose an option (or None) for: ${missingExtras.join(', ')}` }}
              render={({ field, fieldState }) => (
                <>
                  <ChargeGroupPicker
                    charges={extraChargesQuery.data ?? []}
                    value={field.value ?? []}
                    onChange={field.onChange}
                    selectedOptionIds={selectedOptionIds}
                    required={required}
                    customCharges={customCharges ?? []}
                    onCustomChange={(list) => setValue(`items.${index}.custom_charges`, list, { shouldDirty: true })}
                    choices={extrasChoices ?? {}}
                    onChoicesChange={(m) => setValue(`items.${index}.extras_choices`, m, { shouldDirty: true })}
                    showErrors={Boolean(showErrors || fieldState.error)}
                  />
                  {fieldState.error && <FormHelperText error>{fieldState.error.message}</FormHelperText>}
                </>
              )}
            />
          </Grid>
        )}
      </Grid>
    </Paper>
  );
}
