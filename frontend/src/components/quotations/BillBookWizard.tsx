import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { Alert, Box, Divider, Grid, Paper, TextField, Typography } from '@mui/material';
import { productsApi } from '../../api/productsApi';
import { attributesApi } from '../../api/attributesApi';
import { extraChargesApi } from '../../api/extraChargesApi';
import { quotationsApi } from '../../api/quotationsApi';
import type { Attribute, AttributeOption } from '../../types/attributes';
import type { ExtraCharge } from '../../types/extraCharges';
import type { QuotationCreateInput, SelectedOption } from '../../types/quotations';
import SearchSelect from './SearchSelect';
import { applicableCharges, chargeLabel, pruneCharges, setChargeInGroup } from './ChargeGroupPicker';

const LAYER_NAMES = ['Original', 'Duplicate', 'Triplicate', 'Quadruplicate', 'Quintuplicate', 'Sextuplicate', 'Septuplicate'];

function GroupHeading({ children }: { children: ReactNode }) {
  return (
    <Typography
      variant="overline"
      sx={{ display: 'block', fontWeight: 800, color: '#1a237e', letterSpacing: 0.8, mt: 1.5, mb: 0.75, lineHeight: 1.6 }}
    >
      {children}
    </Typography>
  );
}

interface BillBookWizardProps {
  index: number;
  categoryId: number;
}

/**
 * Guided order entry for Bill Books & Stationery, kept compact: every choice is a
 * searchable dropdown in a grid, grouped in production order (document -> paper &
 * printing -> numbering -> binding -> quantity). Later groups unlock once the
 * required choices are made. Everything priced is written into the normal
 * quotation item (product, selected options, extra charges); free-form details
 * (colour per copy, numbering) go into spec_notes, which already flows to the
 * invoice, job card and challan.
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
  const toChoices = (opts: AttributeOption[]) => opts.map((o) => ({ id: o.id, label: o.value }));

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
  const chargeChoices = (group: string) => chargeGroup(group).map((c) => ({ id: c.id, label: chargeLabel(c) }));

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

  // Coloured paper costs more: pick the matching "Coloured Layers" charge automatically
  // from the colours chosen per copy (white / rough paper carry no surcharge).
  const colouredCount = layerColours.filter((c, i) => i < layerCount && c && c !== 'White' && c !== 'Rough').length;
  const colouredCharge = charges.find(
    (c) => c.is_active && c.group_name === 'Coloured Layers' && new RegExp(`- ${colouredCount} Layers?$`).test(c.name),
  );
  const currentColouredId = chargeIds.find((id) => charges.find((c) => c.id === id)?.group_name === 'Coloured Layers') ?? null;
  useEffect(() => {
    const targetId = colouredCount > 0 ? colouredCharge?.id ?? null : null;
    if (charges.length && currentColouredId !== targetId) {
      setValue(`items.${index}.extra_charge_ids`, setChargeInGroup(chargeIds, charges, 'Coloured Layers', targetId), { shouldDirty: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colouredCount, colouredCharge?.id, currentColouredId, charges.length]);

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

  // ---- unlock rules ---------------------------------------------------------------
  const sizeProduct = sizes.find((s) => s.id === item?.product_id);
  const s1 = docAttr ? optionOf(docAttr) != null : true;
  const s2 = Boolean(sizeProduct);
  const sGsm = gsmAttr ? optionOf(gsmAttr) != null : true;
  const early = s1 && s2; // copies, paper
  const late = early && sGsm; // printing .. quantity
  const showBindingDetails = Boolean(bindingType) && !/loose/i.test(bindingType?.name ?? '');
  const sizeLabel = (name: string) => name.replace(/^Sheet Printing - /, '');
  const itemErrors = errors.items?.[index];
  const nextHint = !s1 ? 'Start with the document type.' : !s2 ? 'Next: choose the size.' : !sGsm ? 'Choose the paper GSM / grade to unlock printing, numbering and binding.' : '';

  return (
    <Paper sx={{ p: { xs: 2, md: 3 }, borderRadius: 2, mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, color: '#1a237e' }}>
          Bill Books &amp; Stationery
        </Typography>
        <Typography variant="body2" color={nextHint ? 'warning.main' : 'success.main'} sx={{ fontWeight: 600 }}>
          {nextHint || 'All required choices made ✓'}
        </Typography>
      </Box>

      <Controller
        name={`items.${index}.product_id`}
        control={control}
        rules={{ validate: (v) => Number(v) > 0 || 'Choose the size' }}
        render={() => <></>}
      />
      <Controller
        name={`items.${index}.selected_options`}
        control={control}
        rules={{
          validate: (v) => {
            const has = (a?: Attribute) => !a || (v ?? []).some((s) => s.attribute_id === a.id);
            if (!has(docAttr)) return 'Choose the document type';
            if (!has(gsmAttr)) return 'Choose the paper GSM / grade';
            return true;
          },
        }}
        render={() => <></>}
      />
      {(itemErrors?.product_id?.message || itemErrors?.selected_options?.message) && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {String(itemErrors?.selected_options?.message || itemErrors?.product_id?.message)}
        </Alert>
      )}

      {/* Document ------------------------------------------------------ */}
      <GroupHeading>Document</GroupHeading>
      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <SearchSelect
            required
            label="Document type"
            options={toChoices(optionsOf(docAttr))}
            value={optionOf(docAttr)}
            onChange={(id) => setOption(docAttr, id)}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <SearchSelect
            required
            label="Size"
            disabled={!s1}
            options={sizes.map((p) => ({ id: p.id, label: sizeLabel(p.name) }))}
            value={item?.product_id || null}
            onChange={(id) => setValue(`items.${index}.product_id`, id ?? 0, { shouldDirty: true })}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <SearchSelect
            label="Copies per set"
            disabled={!early}
            options={toChoices(optionsOf(copiesAttr))}
            value={optionOf(copiesAttr)}
            onChange={(id) => setOption(copiesAttr, id)}
          />
        </Grid>
        {Array.from({ length: layerCount }, (_, i) => (
          <Grid key={i} size={{ xs: 12, sm: 6, md: 3 }}>
            <SearchSelect
              label={`${LAYER_NAMES[i] ?? `Copy ${i + 1}`} colour`}
              options={toChoices(colourOptions)}
              value={colourOptions.find((o) => o.value === layerColours[i])?.id ?? null}
              onChange={(id) => {
                const value = colourOptions.find((o) => o.id === id)?.value ?? '';
                setLayerColours((prev) => prev.map((c, k) => (k === i ? value : c)));
              }}
            />
            {layerColours[i] === 'Custom' && (
              <TextField
                fullWidth
                size="small"
                sx={{ mt: 0.75 }}
                placeholder="Colour name"
                value={layerCustom[i] ?? ''}
                onChange={(e) => setLayerCustom((prev) => prev.map((c, k) => (k === i ? e.target.value : c)))}
              />
            )}
          </Grid>
        ))}
      </Grid>

      {/* Paper & printing ---------------------------------------------- */}
      <GroupHeading>Paper &amp; printing</GroupHeading>
      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <SearchSelect
            label="Paper name"
            disabled={!early}
            options={toChoices(optionsOf(paperNameAttr))}
            value={optionOf(paperNameAttr)}
            onChange={(id) => setOption(paperNameAttr, id)}
          />
          {paperNameValue === 'Custom' && (
            <TextField fullWidth size="small" sx={{ mt: 0.75 }} placeholder="Custom paper name" value={paperCustom} onChange={(e) => setPaperCustom(e.target.value)} />
          )}
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <SearchSelect
            required
            label="GSM / grade"
            disabled={!early}
            helperText="Sets the rate"
            options={toChoices(optionsOf(gsmAttr))}
            value={optionOf(gsmAttr)}
            onChange={(id) => setOption(gsmAttr, id)}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <SearchSelect
            label="Print side"
            disabled={!late}
            options={toChoices(optionsOf(sideAttr))}
            value={optionOf(sideAttr)}
            onChange={(id) => setOption(sideAttr, id)}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField fullWidth size="small" label="Printing colour(s)" disabled={!late} value={printColour} onChange={(e) => setPrintColour(e.target.value)} />
        </Grid>
      </Grid>

      {/* Bill type & numbering ----------------------------------------- */}
      <GroupHeading>Bill type &amp; numbering</GroupHeading>
      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <SearchSelect
            label="Bill type"
            disabled={!late}
            options={chargeChoices('Bill Type')}
            value={chargeIn('Bill Type')?.id ?? null}
            onChange={(id) => setCharge('Bill Type', id)}
          />
        </Grid>
        <Grid size={{ xs: 4, md: 3 }}>
          <TextField fullWidth size="small" label="Sl.No from" disabled={!late} value={slFrom} onChange={(e) => setSlFrom(e.target.value)} />
        </Grid>
        <Grid size={{ xs: 4, md: 3 }}>
          <TextField fullWidth size="small" label="Sl.No to" disabled={!late} value={slTo} onChange={(e) => setSlTo(e.target.value)} />
        </Grid>
        <Grid size={{ xs: 4, md: 3 }}>
          <TextField fullWidth size="small" label="Book No. from" disabled={!late} value={bookNo} onChange={(e) => setBookNo(e.target.value)} />
        </Grid>
      </Grid>

      {/* Binding --------------------------------------------------------- */}
      <GroupHeading>Binding</GroupHeading>
      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <SearchSelect
            label="Binding type"
            disabled={!late}
            options={chargeChoices('Binding Type')}
            value={bindingType?.id ?? null}
            onChange={(id) => setCharge('Binding Type', id)}
          />
        </Grid>
        {showBindingDetails && (
          <>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <SearchSelect
                label="Binding model"
                options={chargeChoices('Binding Model')}
                value={chargeIn('Binding Model')?.id ?? null}
                onChange={(id) => setCharge('Binding Model', id)}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <SearchSelect
                label="Binding set"
                helperText={copiesValue ? undefined : 'Choose copies per set first'}
                disabled={!copiesValue}
                options={chargeChoices('Binding Set')}
                value={chargeIn('Binding Set')?.id ?? null}
                onChange={(id) => setCharge('Binding Set', id)}
              />
            </Grid>
          </>
        )}
        {bindingIsCustom && (
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField fullWidth size="small" placeholder="Describe the custom binding" value={bindingCustom} onChange={(e) => setBindingCustom(e.target.value)} />
          </Grid>
        )}
      </Grid>

      {/* Quantity & price ------------------------------------------------ */}
      <Divider sx={{ mt: 2.5, mb: 1.5 }} />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
        <TextField
          label="Quantity (Nos)"
          type="number"
          size="small"
          disabled={!late}
          sx={{ width: 190 }}
          {...register(`items.${index}.quantity`, { required: true, valueAsNumber: true, min: 1 })}
        />
        {price &&
          (price.priceable ? (
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 3, flexWrap: 'wrap' }}>
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
    </Paper>
  );
}
