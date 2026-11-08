import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { Alert, Box, Divider, Grid, Paper, TextField, Typography } from '@mui/material';
import { productsApi } from '../../api/productsApi';
import { attributesApi } from '../../api/attributesApi';
import { extraChargesApi } from '../../api/extraChargesApi';
import type { Attribute, AttributeOption } from '../../types/attributes';
import type { ExtraCharge } from '../../types/extraCharges';
import type { LayerSpec, QuotationCreateInput, SelectedOption } from '../../types/quotations';
import SearchSelect from './SearchSelect';
import { applicableCharges, chargeLabel, pruneCharges, setChargeInGroup } from './ChargeGroupPicker';
import { RateInfo } from './PriceBreakdown';
import { quotationsApi } from '../../api/quotationsApi';
import type { QuotationPreviewItem } from '../../types/quotations';

const PRINT_COLOURS = ['Black', 'Navy Blue', 'Custom'];
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

interface CopyState {
  paper: number | null;   // paper name option (null = same as the Original copy)
  gsm: number | null;     // GSM option (null = same as the Original copy)
  size: number | null;    // size item (null = same as the Original copy)
  colour: string;
  colourCustom: string;
  paperCustom: string;
}
const blankCopy = (): CopyState => ({ paper: null, gsm: null, size: null, colour: '', colourCustom: '', paperCustom: '' });

/**
 * Guided order entry for Bill Books & Stationery, kept compact: every choice is a
 * searchable dropdown in a grid, grouped in production order (document -> paper of
 * each copy -> printing -> numbering -> binding). Every copy of the set (Original,
 * Duplicate ...) gets the same four choices - paper name, GSM, paper size, colour -
 * with the Original copy first. Everything priced is written into the normal quotation
 * item; the paper of every copy goes in layer_specs and into spec_notes, which flows to
 * the invoice, job card and challan.
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

  // ---- the paper of every copy ------------------------------------------------
  const copiesValue = optionValue(copiesAttr); // e.g. "1+3"
  const layerCount = copiesValue ? 1 + (parseInt(copiesValue.split('+')[1], 10) || 0) : 0;
  const copiesN = Math.max(layerCount, 1); // a plain sheet is still one copy
  const [copies, setCopies] = useState<CopyState[]>([blankCopy()]);
  const [printColour, setPrintColour] = useState('Black');
  const [printColourCustom, setPrintColourCustom] = useState('');
  const [slFrom, setSlFrom] = useState('');
  const [slTo, setSlTo] = useState('');
  const [bookNo, setBookNo] = useState('');
  const [bindingCustom, setBindingCustom] = useState('');

  useEffect(() => {
    setCopies((prev) => Array.from({ length: copiesN }, (_, i) => prev[i] ?? blankCopy()));
  }, [copiesN]);
  const patchCopy = (i: number, patch: Partial<CopyState>) =>
    setCopies((prev) => prev.map((c, k) => (k === i ? { ...c, ...patch } : c)));

  const colourOptions = optionsOf(colourAttr);
  const topPaperId = optionOf(paperNameAttr);
  const topGsmId = optionOf(gsmAttr);
  const topSizeId = item?.product_id || null;
  const paperOptions = optionsOf(paperNameAttr);
  const gsmOptions = optionsOf(gsmAttr);
  const sizeLabel = (name: string) => name.replace(/^Sheet Printing - /, '');

  const paperIdOf = (i: number) => (i === 0 ? topPaperId : copies[i]?.paper ?? topPaperId);
  const gsmIdOf = (i: number) => (i === 0 ? topGsmId : copies[i]?.gsm ?? topGsmId);
  const sizeIdOf = (i: number) => (i === 0 ? topSizeId : copies[i]?.size ?? topSizeId);
  const colourOf = (i: number) => {
    const c = copies[i];
    if (!c) return '';
    return c.colour === 'Custom' ? c.colourCustom.trim() || 'Custom' : c.colour;
  };
  const layerName = (i: number) => (copiesN === 1 ? 'Paper' : LAYER_NAMES[i] ?? `Copy ${i + 1}`);

  // Sent to the price calculation (every copy is priced in its own GSM / size) and kept on the order for the job card.
  const layerSpecs: LayerSpec[] = useMemo(
    () => Array.from({ length: copiesN }, (_, i) => ({
      paper_option_id: paperIdOf(i),
      gsm_option_id: gsmIdOf(i),
      size_product_id: sizeIdOf(i),
      colour: colourOf(i) || null,
      paper_custom: (paperOptions.find((o) => o.id === paperIdOf(i))?.value === 'Custom' ? (i === 0 ? copies[0]?.paperCustom : copies[i]?.paperCustom) : '')?.trim() || null,
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [copiesN, JSON.stringify(copies), topPaperId, topGsmId, topSizeId, paperOptions.length],
  );
  useEffect(() => {
    setValue(`items.${index}.layer_specs`, topGsmId && topSizeId ? layerSpecs : [], { shouldDirty: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(layerSpecs), topGsmId, topSizeId]);

  // Coloured paper costs more: pick the matching "Coloured Layers" charge automatically
  // from the colours chosen per copy (white / rough paper carry no surcharge).
  const colouredCount = copies.filter((c, i) => i < layerCount && c.colour && c.colour !== 'White' && c.colour !== 'Rough').length;
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

  // Bill type starts as "Nil": some documents have no bill type at all, so staff only pick one when it applies.
  const nilBillType = charges.find((c) => c.is_active && c.group_name === 'Bill Type' && /nil/i.test(c.name));
  const hasBillType = chargeIds.some((id) => charges.find((c) => c.id === id)?.group_name === 'Bill Type');
  useEffect(() => {
    if (nilBillType && !hasBillType) {
      setValue(`items.${index}.extra_charge_ids`, setChargeInGroup(chargeIds, charges, 'Bill Type', nilBillType.id), { shouldDirty: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nilBillType?.id, hasBillType]);

  const bindingType = chargeIn('Binding Type');
  const bindingIsCustom = Boolean(bindingType && /custom/i.test(bindingType.name));

  // The written specification (shown on the invoice, job card and challan): the paper of EVERY copy, then the rest.
  const notes = useMemo(() => {
    const parts: string[] = [];
    if (topGsmId || topPaperId) {
      const perCopy = Array.from({ length: copiesN }, (_, i) => {
        const paperValue = paperOptions.find((o) => o.id === paperIdOf(i))?.value ?? '';
        const paper = paperValue === 'Custom' ? copies[i]?.paperCustom.trim() || 'Custom paper' : paperValue;
        const gsm = gsmOptions.find((o) => o.id === gsmIdOf(i))?.value ?? '';
        const size = sizeLabel(sizes.find((p) => p.id === sizeIdOf(i))?.name ?? '');
        const text = [paper, gsm, size, colourOf(i)].filter(Boolean).join(', ');
        return text ? `${layerName(i)}: ${text}` : '';
      }).filter(Boolean);
      parts.push(`${copiesValue ? `Copies ${copiesValue} - ` : ''}${perCopy.join('; ')}`);
    }
    const printColourText = printColour === 'Custom' ? printColourCustom.trim() : printColour;
    if (printColourText) parts.push(`Printing colour: ${printColourText}`);
    const numbering = [
      slFrom || slTo ? `Sl.No ${slFrom || '?'}–${slTo || '?'}` : '',
      bookNo ? `Book No ${bookNo}` : '',
    ].filter(Boolean);
    if (numbering.length) parts.push(numbering.join(', '));
    if (bindingIsCustom && bindingCustom.trim()) parts.push(`Binding: ${bindingCustom.trim()}`);
    return parts.join(' | ');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copiesN, copiesValue, JSON.stringify(copies), topPaperId, topGsmId, topSizeId, sizes.length, paperOptions.length, gsmOptions.length, printColour, printColourCustom, slFrom, slTo, bookNo, bindingIsCustom, bindingCustom]);

  useEffect(() => {
    setValue(`items.${index}.spec_notes`, notes || undefined);
  }, [notes, index, setValue]);

  // ---- live price ---------------------------------------------------------------
  const withGst = useWatch({ control, name: 'with_gst' });
  const [price, setPrice] = useState<QuotationPreviewItem | null>(null);
  const priceKey = JSON.stringify([item?.product_id, item?.quantity, selected, chargeIds, item?.layer_specs, withGst]);
  useEffect(() => {
    if (!item?.product_id) {
      setPrice(null);
      return;
    }
    const timer = setTimeout(() => {
      quotationsApi
        .preview({
          tax_id: null,
          with_gst: Boolean(withGst),
          items: [{
            product_id: item.product_id,
            quantity: Number(item.quantity) || 1,
            selected_options: selected,
            extra_charge_ids: chargeIds,
            layer_specs: item.layer_specs ?? [],
          }],
        })
        .then((r) => setPrice(r.items[0]))
        .catch(() => setPrice(null));
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceKey]);

  // ---- unlock rules ---------------------------------------------------------------
  const s1 = docAttr ? optionOf(docAttr) != null : true;
  const s2 = Boolean(sizes.find((s) => s.id === item?.product_id));
  const sGsm = gsmAttr ? optionOf(gsmAttr) != null : true;
  const late = s1 && s2 && sGsm; // quantity .. binding
  const showBindingDetails = Boolean(bindingType) && !/loose/i.test(bindingType?.name ?? '');
  const itemErrors = errors.items?.[index];
  const nextHint = !s1 ? 'Start with the document type.' : !s2 ? 'Next: choose the paper size of the Original copy.' : !sGsm ? 'Choose the GSM / grade of the Original copy to unlock printing, numbering and binding.' : '';

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
        rules={{ validate: (v) => Number(v) > 0 || 'Choose the paper size' }}
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
            label="Copies per set"
            disabled={!s1}
            options={optionsOf(copiesAttr).map((o) => ({ id: o.id, label: o.value === '1' ? '1 (no extra copy)' : o.value }))}
            value={optionOf(copiesAttr)}
            onChange={(id) => setOption(copiesAttr, id)}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <TextField
            fullWidth
            required
            size="small"
            label="Quantity (Nos)"
            type="number"
            disabled={!s2}
            {...register(`items.${index}.quantity`, { required: true, valueAsNumber: true, min: 1 })}
          />
        </Grid>
      </Grid>

      {/* Paper of each copy: the Original copy first, then Duplicate ... -------------------- */}
      <GroupHeading>Paper of each copy</GroupHeading>
      <Box sx={{ display: 'grid', gap: 1.25 }}>
        {Array.from({ length: copiesN }, (_, i) => {
          const copy = copies[i] ?? blankCopy();
          const enabled = i === 0 ? s1 : s2 && sGsm;
          const sameHint = i === 0 ? undefined : 'Same as the Original copy';
          const paperId = paperIdOf(i);
          const paperValue = paperOptions.find((o) => o.id === paperId)?.value;
          return (
            <Paper key={i} variant="outlined" sx={{ p: 1.5, borderRadius: 2, borderColor: i === 0 ? '#1a237e' : undefined }} data-testid={`copy-card-${i}`}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#1a237e', mb: 1 }}>
                {i + 1}. {layerName(i)} copy
              </Typography>
              <Grid container spacing={1.5}>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <SearchSelect
                    label="Paper name"
                    disabled={!enabled}
                    helperText={sameHint}
                    options={toChoices(paperOptions)}
                    value={paperId}
                    onChange={(id) => (i === 0 ? setOption(paperNameAttr, id) : patchCopy(i, { paper: id }))}
                  />
                  {paperValue === 'Custom' && (
                    <TextField fullWidth size="small" sx={{ mt: 0.75 }} placeholder="Custom paper name" value={copy.paperCustom} onChange={(e) => patchCopy(i, { paperCustom: e.target.value })} />
                  )}
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <SearchSelect
                    required={i === 0}
                    label="GSM / grade"
                    disabled={!enabled}
                    helperText={i === 0 ? 'Sets the rate' : sameHint}
                    options={toChoices(gsmOptions)}
                    value={gsmIdOf(i)}
                    onChange={(id) => (i === 0 ? setOption(gsmAttr, id) : patchCopy(i, { gsm: id }))}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <SearchSelect
                    required={i === 0}
                    label="Paper size"
                    disabled={!enabled}
                    helperText={sameHint}
                    options={sizes.map((p) => ({ id: p.id, label: sizeLabel(p.name) }))}
                    value={sizeIdOf(i)}
                    onChange={(id) => (i === 0 ? setValue(`items.${index}.product_id`, id ?? 0, { shouldDirty: true }) : patchCopy(i, { size: id }))}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <SearchSelect
                    label="Colour"
                    disabled={!enabled}
                    options={toChoices(colourOptions)}
                    value={colourOptions.find((o) => o.value === copy.colour)?.id ?? null}
                    onChange={(id) => patchCopy(i, { colour: colourOptions.find((o) => o.id === id)?.value ?? '' })}
                  />
                  {copy.colour === 'Custom' && (
                    <TextField fullWidth size="small" sx={{ mt: 0.75 }} placeholder="Colour name" value={copy.colourCustom} onChange={(e) => patchCopy(i, { colourCustom: e.target.value })} />
                  )}
                </Grid>
              </Grid>
            </Paper>
          );
        })}
      </Box>

      {/* Printing --------------------------------------------------------- */}
      <GroupHeading>Printing</GroupHeading>
      <Grid container spacing={1.5}>
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
          <SearchSelect
            label="Printing colour"
            disabled={!late}
            options={PRINT_COLOURS.map((c, i) => ({ id: i + 1, label: c }))}
            value={PRINT_COLOURS.indexOf(printColour) + 1 || null}
            onChange={(id) => setPrintColour(id == null ? '' : PRINT_COLOURS[id - 1])}
          />
          {printColour === 'Custom' && (
            <TextField fullWidth size="small" sx={{ mt: 0.75 }} placeholder="Printing colour(s)" value={printColourCustom} onChange={(e) => setPrintColourCustom(e.target.value)} />
          )}
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

      {/* Rate & price ------------------------------------------------------ */}
      <Divider sx={{ mt: 2.5, mb: 1.5 }} />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
        {price &&
          (price.priceable ? (
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 3, flexWrap: 'wrap' }}>
              <Typography variant="body2" color="text.secondary">
                Rate: <strong data-testid="line-rate">₹{price.unit_price.toFixed(2)}</strong>
              </Typography>
              {(price.print_charge ?? 0) > 0 && (
                <Typography variant="body2" color="text.secondary">
                  Paper &amp; extras ₹{(price.total_price - (price.print_charge ?? 0)).toFixed(2)} + printing <strong>₹{(price.print_charge ?? 0).toFixed(2)}</strong>
                </Typography>
              )}
              <Typography variant="h6" sx={{ fontWeight: 800, color: '#1a237e' }} data-testid="line-amount">
                Amount: ₹{price.total_price.toFixed(2)}
              </Typography>
              <RateInfo
                rows={price.breakdown}
                title={`Bill Books & Stationery x ${Number(item?.quantity) || 0}`}
                rate={price.unit_price}
                amount={price.total_price}
                label="Why this rate?"
              />
              {price.total_price === 0 && (
                <Typography variant="caption" color="warning.main">
                  Rates for this combination are not entered yet (Pricing Setup) — showing ₹0.
                </Typography>
              )}
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">Price appears once size, quantity and paper are chosen.</Typography>
          ))}
      </Box>
    </Paper>
  );
}
