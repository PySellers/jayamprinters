import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { Alert, Box, Grid, MenuItem, Paper, TextField, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { productsApi } from '../../api/productsApi';
import { attributesApi } from '../../api/attributesApi';
import { extraChargesApi } from '../../api/extraChargesApi';
import { quotationsApi } from '../../api/quotationsApi';
import type { Attribute, AttributeOption } from '../../types/attributes';
import type { ExtraCharge } from '../../types/extraCharges';
import type { QuotationCreateInput, SelectedOption } from '../../types/quotations';
import ChoiceChips from './ChoiceChips';
import { applicableCharges, chargeLabel, pruneCharges, setChargeInGroup } from './ChargeGroupPicker';

const LAYER_NAMES = ['Original', 'Duplicate', 'Triplicate', 'Quadruplicate', 'Quintuplicate', 'Sextuplicate', 'Septuplicate'];

interface StepCardProps {
  n: number;
  title: string;
  done: boolean;
  locked: boolean;
  summary?: string;
  children: ReactNode;
}

function StepCard({ n, title, done, locked, summary, children }: StepCardProps) {
  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 1.5, borderRadius: 2, opacity: locked ? 0.55 : 1, borderColor: done ? '#2e7d32' : undefined }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: locked ? 0 : 1.5 }}>
        {done ? (
          <CheckCircleIcon sx={{ color: '#2e7d32' }} />
        ) : (
          <Box sx={{ width: 24, height: 24, borderRadius: '50%', bgcolor: '#1a237e', color: '#fff', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {n}
          </Box>
        )}
        <Typography sx={{ fontWeight: 700 }}>{title}</Typography>
        {summary && (
          <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto', textAlign: 'right' }}>
            {summary}
          </Typography>
        )}
      </Box>
      {locked ? (
        <Typography variant="caption" color="text.secondary" sx={{ ml: 4.5 }}>
          Complete the earlier steps first
        </Typography>
      ) : (
        children
      )}
    </Paper>
  );
}

interface BillBookWizardProps {
  index: number;
  categoryId: number;
}

/**
 * Guided, one-step-at-a-time order entry for Bill Books & Stationery.
 * Order follows production: what it is -> size -> copies/colours -> paper ->
 * printing -> bill type -> numbering -> binding -> quantity. Everything priced
 * is written into the normal quotation item (product, selected options, extra
 * charges); free-form details (colours per copy, numbering) go into spec_notes,
 * which already flows to the invoice, job card and challan.
 */
export default function BillBookWizard({ index, categoryId }: BillBookWizardProps) {
  const { control, setValue, register, formState: { errors } } = useFormContext<QuotationCreateInput>();
  const item = useWatch({ control, name: `items.${index}` });

  const productsQuery = useQuery({ queryKey: ['product-picker', 'list'], queryFn: productsApi.list });
  const attributesQuery = useQuery({ queryKey: ['attributes', categoryId], queryFn: () => attributesApi.list(categoryId) });
  const chargesQuery = useQuery({ queryKey: ['extra-charges', categoryId], queryFn: () => extraChargesApi.list(categoryId) });

  const sizes = useMemo(
    () => (productsQuery.data ?? []).filter((p) => p.category_id === categoryId && p.is_active),
    [productsQuery.data, categoryId],
  );
  const attributes = attributesQuery.data ?? [];
  const charges: ExtraCharge[] = chargesQuery.data ?? [];

  const attrByName = (name: string): Attribute | undefined => attributes.find((a) => a.name === name && a.is_active);
  const optionsOf = (attr?: Attribute): AttributeOption[] =>
    (attr?.options ?? []).filter((o) => o.is_active).sort((a, b) => a.display_order - b.display_order);

  const docAttr = attrByName('Document Type');
  const copiesAttr = attrByName('Copies per Set');
  const paperNameAttr = attrByName('Paper Name');
  const gsmAttr = attrByName('Paper/GSM Type');
  const colourAttr = attrByName('Paper Colour');
  const sideAttr = attrByName('Print Side');

  const selected: SelectedOption[] = item?.selected_options ?? [];
  const chargeIds: number[] = item?.extra_charge_ids ?? [];
  const selectedOptionIds = selected.map((s) => s.attribute_option_id);
  const optionOf = (attr?: Attribute) => (attr ? selected.find((s) => s.attribute_id === attr.id)?.attribute_option_id ?? null : null);
  const optionValue = (attr?: Attribute) => optionsOf(attr).find((o) => o.id === optionOf(attr))?.value ?? '';

  function setOption(attr: Attribute | undefined, optionId: number | null) {
    if (!attr) return;
    const next = [
      ...selected.filter((s) => s.attribute_id !== attr.id),
      ...(optionId == null ? [] : [{ attribute_id: attr.id, attribute_option_id: optionId }]),
    ];
    setValue(`items.${index}.selected_options`, next, { shouldDirty: true });
    // A copies change can invalidate binding-set prices that depend on it.
    setValue(
      `items.${index}.extra_charge_ids`,
      pruneCharges(chargeIds, charges, next.map((s) => s.attribute_option_id)),
      { shouldDirty: true },
    );
  }

  function setCharge(group: string, id: number | null) {
    let next = setChargeInGroup(chargeIds, charges, group, id);
    if (group === 'Binding Type') {
      const picked = charges.find((c) => c.id === id);
      if (!picked || /loose/i.test(picked.name)) {
        // Loose sheets are not bound: model and set size no longer apply.
        next = setChargeInGroup(setChargeInGroup(next, charges, 'Binding Model', null), charges, 'Binding Set', null);
      }
    }
    setValue(`items.${index}.extra_charge_ids`, next, { shouldDirty: true });
  }

  const chargeGroup = (group: string) => applicableCharges(charges, selectedOptionIds).filter((c) => c.group_name === group);
  const chargeIn = (group: string) => chargeGroup(group).find((c) => chargeIds.includes(c.id));

  // ---- free-form details (kept in spec_notes) ---------------------------------
  const copiesValue = optionValue(copiesAttr); // e.g. "1+3"
  const layerCount = copiesValue ? 1 + (parseInt(copiesValue.split('+')[1], 10) || 0) : 0;
  const colourOptions = optionsOf(colourAttr);
  const [layerColours, setLayerColours] = useState<string[]>([]);
  const [layerCustom, setLayerCustom] = useState<string[]>([]);
  const [paperCustom, setPaperCustom] = useState('');
  const [printColour, setPrintColour] = useState('');
  const [slFrom, setSlFrom] = useState('');
  const [slTo, setSlTo] = useState('');
  const [bookNo, setBookNo] = useState('');
  const [bindingCustom, setBindingCustom] = useState('');

  useEffect(() => {
    setLayerColours((prev) => Array.from({ length: layerCount }, (_, i) => prev[i] ?? ''));
    setLayerCustom((prev) => Array.from({ length: layerCount }, (_, i) => prev[i] ?? ''));
  }, [layerCount]);

  const paperNameValue = optionValue(paperNameAttr);
  const bindingType = chargeIn('Binding Type');
  const bindingIsCustom = Boolean(bindingType && /custom/i.test(bindingType.name));

  const notes = useMemo(() => {
    const parts: string[] = [];
    if (layerCount > 0) {
      const perLayer = Array.from({ length: layerCount }, (_, i) => {
        const colour = layerColours[i] === 'Custom' ? layerCustom[i]?.trim() || 'Custom' : layerColours[i];
        return colour ? `${LAYER_NAMES[i] ?? `Copy ${i + 1}`}: ${colour}` : '';
      }).filter(Boolean);
      parts.push(`Copies ${copiesValue}${perLayer.length ? ` (${perLayer.join(', ')})` : ''}`);
    }
    if (paperNameValue === 'Custom' && paperCustom.trim()) parts.push(`Paper: ${paperCustom.trim()}`);
    if (printColour.trim()) parts.push(`Printing colour: ${printColour.trim()}`);
    const numbering = [
      slFrom || slTo ? `Sl.No ${slFrom || '?'}–${slTo || '?'}` : '',
      bookNo ? `Book No ${bookNo}` : '',
    ].filter(Boolean);
    if (numbering.length) parts.push(numbering.join(', '));
    if (bindingIsCustom && bindingCustom.trim()) parts.push(`Binding: ${bindingCustom.trim()}`);
    return parts.join(' | ');
  }, [layerCount, copiesValue, layerColours, layerCustom, paperNameValue, paperCustom, printColour, slFrom, slTo, bookNo, bindingIsCustom, bindingCustom]);

  useEffect(() => {
    setValue(`items.${index}.spec_notes`, notes || undefined);
  }, [notes, index, setValue]);

  // ---- live price ---------------------------------------------------------------
  const [price, setPrice] = useState<{ rate: number; amount: number; priceable: boolean } | null>(null);
  const priceKey = JSON.stringify([item?.product_id, item?.quantity, selected, chargeIds]);
  useEffect(() => {
    if (!item?.product_id) {
      setPrice(null);
      return;
    }
    const timer = setTimeout(() => {
      quotationsApi
        .preview({
          tax_id: null,
          items: [{
            product_id: item.product_id,
            quantity: Number(item.quantity) || 1,
            selected_options: selected,
            extra_charge_ids: chargeIds,
          }],
        })
        .then((r) => setPrice({ rate: r.items[0].unit_price, amount: r.items[0].total_price, priceable: r.items[0].priceable }))
        .catch(() => setPrice(null));
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceKey]);

  // ---- step state ---------------------------------------------------------------
  const sizeProduct = sizes.find((s) => s.id === item?.product_id);
  const s1 = docAttr ? optionOf(docAttr) != null : true;
  const s2 = Boolean(sizeProduct);
  const sGsm = gsmAttr ? optionOf(gsmAttr) != null : true;
  const early = s1 && s2; // steps 3-4
  const late = early && sGsm; // steps 5-9
  const modelCharges = chargeGroup('Binding Model');
  const setCharges = chargeGroup('Binding Set');
  const showBindingDetails = Boolean(bindingType) && !/loose/i.test(bindingType?.name ?? '');
  const sizeLabel = (name: string) => name.replace(/^Sheet Printing - /, '');
  const toChoices = (opts: AttributeOption[]) => opts.map((o) => ({ id: o.id, label: o.value }));
  const itemErrors = errors.items?.[index];

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="h6" sx={{ fontWeight: 700, color: '#1a237e', mb: 0.5 }}>
        Bill Books &amp; Stationery
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Answer the steps in order — the price updates as you go.
      </Typography>

      <Controller
        name={`items.${index}.product_id`}
        control={control}
        rules={{ validate: (v) => Number(v) > 0 || 'Choose the size (step 2)' }}
        render={() => <></>}
      />
      <Controller
        name={`items.${index}.selected_options`}
        control={control}
        rules={{
          validate: (v) => {
            const has = (a?: Attribute) => !a || (v ?? []).some((s) => s.attribute_id === a.id);
            if (!has(docAttr)) return 'Choose the document type (step 1)';
            if (!has(gsmAttr)) return 'Choose the paper GSM / grade (step 4)';
            return true;
          },
        }}
        render={() => <></>}
      />
      {(itemErrors?.product_id?.message || itemErrors?.selected_options?.message) && (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          {String(itemErrors?.selected_options?.message || itemErrors?.product_id?.message)}
        </Alert>
      )}

      <StepCard n={1} title="Document type" done={s1} locked={false} summary={optionValue(docAttr)}>
        <ChoiceChips options={toChoices(optionsOf(docAttr))} value={optionOf(docAttr)} onChange={(id) => setOption(docAttr, id)} />
      </StepCard>

      <StepCard n={2} title="Size" done={s2} locked={!s1} summary={sizeProduct ? sizeLabel(sizeProduct.name) : ''}>
        <ChoiceChips
          options={sizes.map((p) => ({ id: p.id, label: sizeLabel(p.name) }))}
          value={item?.product_id || null}
          onChange={(id) => setValue(`items.${index}.product_id`, id ?? 0, { shouldDirty: true })}
        />
      </StepCard>

      <StepCard n={3} title="Copies per set & paper colours" done={layerCount > 0} locked={!early} summary={copiesValue}>
        <ChoiceChips
          allowClear
          options={toChoices(optionsOf(copiesAttr))}
          value={optionOf(copiesAttr)}
          onChange={(id) => setOption(copiesAttr, id)}
        />
        {layerCount > 0 && (
          <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
            {Array.from({ length: layerCount }, (_, i) => (
              <Grid key={i} size={{ xs: 12, sm: 6, md: 4 }}>
                <TextField
                  select
                  fullWidth
                  size="small"
                  label={`${LAYER_NAMES[i] ?? `Copy ${i + 1}`} colour`}
                  value={layerColours[i] ?? ''}
                  onChange={(e) => setLayerColours((prev) => prev.map((c, k) => (k === i ? e.target.value : c)))}
                >
                  {colourOptions.map((o) => (
                    <MenuItem key={o.id} value={o.value}>{o.value}</MenuItem>
                  ))}
                </TextField>
                {layerColours[i] === 'Custom' && (
                  <TextField
                    fullWidth
                    size="small"
                    sx={{ mt: 0.5 }}
                    placeholder="Colour name"
                    value={layerCustom[i] ?? ''}
                    onChange={(e) => setLayerCustom((prev) => prev.map((c, k) => (k === i ? e.target.value : c)))}
                  />
                )}
              </Grid>
            ))}
          </Grid>
        )}
      </StepCard>

      <StepCard n={4} title="Paper" done={sGsm} locked={!early} summary={[paperNameValue, optionValue(gsmAttr)].filter(Boolean).join(' · ')}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>Paper name</Typography>
        <ChoiceChips allowClear options={toChoices(optionsOf(paperNameAttr))} value={optionOf(paperNameAttr)} onChange={(id) => setOption(paperNameAttr, id)} />
        {paperNameValue === 'Custom' && (
          <TextField size="small" sx={{ mt: 1 }} placeholder="Custom paper name" value={paperCustom} onChange={(e) => setPaperCustom(e.target.value)} />
        )}
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, mb: 0.5 }}>GSM / grade (sets the rate) *</Typography>
        <ChoiceChips options={toChoices(optionsOf(gsmAttr))} value={optionOf(gsmAttr)} onChange={(id) => setOption(gsmAttr, id)} />
      </StepCard>

      <StepCard n={5} title="Printing" done={late && (optionOf(sideAttr) != null || printColour.trim() !== '')} locked={!late} summary={[optionValue(sideAttr), printColour].filter(Boolean).join(' · ')}>
        <ChoiceChips allowClear options={toChoices(optionsOf(sideAttr))} value={optionOf(sideAttr)} onChange={(id) => setOption(sideAttr, id)} />
        <TextField size="small" sx={{ mt: 1.5, minWidth: 260 }} label="Printing colour(s)" value={printColour} onChange={(e) => setPrintColour(e.target.value)} />
      </StepCard>

      <StepCard n={6} title="Bill type" done={Boolean(chargeIn('Bill Type'))} locked={!late} summary={chargeIn('Bill Type') ? chargeLabel(chargeIn('Bill Type')!) : ''}>
        <ChoiceChips
          allowClear
          options={chargeGroup('Bill Type').map((c) => ({ id: c.id, label: chargeLabel(c) }))}
          value={chargeIn('Bill Type')?.id ?? null}
          onChange={(id) => setCharge('Bill Type', id)}
        />
      </StepCard>

      <StepCard n={7} title="Numbering" done={late && Boolean(slFrom || slTo || bookNo)} locked={!late} summary={[slFrom || slTo ? `Sl.No ${slFrom}–${slTo}` : '', bookNo ? `Book ${bookNo}` : ''].filter(Boolean).join(' · ')}>
        <Grid container spacing={1.5}>
          <Grid size={{ xs: 6, sm: 3 }}><TextField fullWidth size="small" label="Sl.No from" value={slFrom} onChange={(e) => setSlFrom(e.target.value)} /></Grid>
          <Grid size={{ xs: 6, sm: 3 }}><TextField fullWidth size="small" label="Sl.No to" value={slTo} onChange={(e) => setSlTo(e.target.value)} /></Grid>
          <Grid size={{ xs: 6, sm: 3 }}><TextField fullWidth size="small" label="Book No. from" value={bookNo} onChange={(e) => setBookNo(e.target.value)} /></Grid>
        </Grid>
      </StepCard>

      <StepCard n={8} title="Binding" done={Boolean(bindingType)} locked={!late} summary={[bindingType ? chargeLabel(bindingType) : '', chargeIn('Binding Model') ? chargeLabel(chargeIn('Binding Model')!) : '', chargeIn('Binding Set') ? chargeLabel(chargeIn('Binding Set')!) : ''].filter(Boolean).join(' · ')}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>Binding type</Typography>
        <ChoiceChips
          allowClear
          options={chargeGroup('Binding Type').map((c) => ({ id: c.id, label: chargeLabel(c) }))}
          value={bindingType?.id ?? null}
          onChange={(id) => setCharge('Binding Type', id)}
        />
        {bindingIsCustom && (
          <TextField size="small" sx={{ mt: 1 }} placeholder="Describe the custom binding" value={bindingCustom} onChange={(e) => setBindingCustom(e.target.value)} />
        )}
        {showBindingDetails && (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, mb: 0.5 }}>Binding model</Typography>
            <ChoiceChips
              allowClear
              options={modelCharges.map((c) => ({ id: c.id, label: chargeLabel(c) }))}
              value={chargeIn('Binding Model')?.id ?? null}
              onChange={(id) => setCharge('Binding Model', id)}
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, mb: 0.5 }}>Binding set (price depends on copies per set)</Typography>
            <ChoiceChips
              allowClear
              options={setCharges.map((c) => ({ id: c.id, label: chargeLabel(c) }))}
              value={chargeIn('Binding Set')?.id ?? null}
              onChange={(id) => setCharge('Binding Set', id)}
              emptyText="Choose copies per set in step 3 to see the binding set options."
            />
          </>
        )}
      </StepCard>

      <StepCard n={9} title="Quantity" done={late && Number(item?.quantity) > 0} locked={!late}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
          <TextField
            label="Quantity (Nos)"
            type="number"
            size="small"
            sx={{ width: 180 }}
            {...register(`items.${index}.quantity`, { required: true, valueAsNumber: true, min: 1 })}
          />
          {price &&
            (price.priceable ? (
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Rate: <strong>₹{price.rate.toFixed(2)}</strong>
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 800, color: '#1a237e' }}>
                  Amount: ₹{price.amount.toFixed(2)}
                </Typography>
                {price.amount === 0 && (
                  <Typography variant="caption" color="warning.main">
                    Rates for this combination are not entered yet (Pricing Setup) — showing ₹0.
                  </Typography>
                )}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">Price appears once size and paper are chosen.</Typography>
            ))}
        </Box>
      </StepCard>
    </Box>
  );
}
