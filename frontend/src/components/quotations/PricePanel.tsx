import { useQueries, useQuery } from '@tanstack/react-query';
import { Box, Chip, Divider, Link, Paper, Typography } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import EditIcon from '@mui/icons-material/Edit';
import { useAuth } from '../../context/AuthContext';
import { attributesApi } from '../../api/attributesApi';
import { extraChargesApi } from '../../api/extraChargesApi';
import { productCategoriesApi, productsApi } from '../../api/productsApi';
import type { BreakdownRow, QuotationItemInput, QuotationPreview } from '../../types/quotations';
import { pricingLinkFor } from './PriceBreakdown';
import { unansweredSections } from './ChargeGroupPicker';

const money = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PART_COLOUR: Record<string, string> = {
  paper: '#1a237e', option: '#6a1b9a', charge: '#00695c', custom: '#00695c', printing: '#ef6c00', minimum: '#c62828',
};
const PART_TITLE: Record<string, string> = {
  paper: 'Rate', option: 'Option extra', charge: 'Extra', custom: 'Extra (typed)', printing: 'Printing', minimum: 'Minimum charge',
};

interface Props {
  preview: QuotationPreview | null;
  items: (QuotationItemInput | undefined)[];
  withGst: boolean;
  discountLabel?: string;
  advance?: number;
}

/**
 * The price, always in view on the right of the order screen: the total in big figures and every PART of the price listed
 * separately (rate, each extra, printing, minimum charge, discount, GST) with a link to the place where the owner can check or
 * change that rate. It updates as the sections of the service are chosen; until the order can be priced it says what is missing.
 */
export default function PricePanel({ preview, items, withGst, discountLabel, advance = 0 }: Props) {
  const { user } = useAuth();
  const canEdit = user?.role === 'admin';
  const products = useQuery({ queryKey: ['product-picker', 'list'], queryFn: productsApi.list });
  const categories = useQuery({ queryKey: ['product-categories'], queryFn: productCategoriesApi.list });
  const lines = (items ?? []).map((it, i) => ({ it, i })).filter((x) => x.it && x.it.product_id);
  const categoryIds = Array.from(new Set(lines.map(({ it }) => products.data?.find((p) => p.id === it!.product_id)?.category_id).filter((c): c is number => Boolean(c))));
  const attrQueries = useQueries({ queries: categoryIds.map((id) => ({ queryKey: ['attributes', id], queryFn: () => attributesApi.list(id) })) });
  const chargeQueries = useQueries({ queries: categoryIds.map((id) => ({ queryKey: ['extra-charges', id], queryFn: () => extraChargesApi.list(id) })) });

  /** What still has to be chosen before this line can be priced. */
  const missingFor = (it: QuotationItemInput): string[] => {
    const product = products.data?.find((p) => p.id === it.product_id);
    if (!product) return [];
    const k = categoryIds.indexOf(product.category_id ?? -1);
    const attrs = (attrQueries[k]?.data ?? []).filter((a) => a.is_active);
    const chosen = new Set((it.selected_options ?? []).map((o) => o.attribute_id));
    const missing = attrs
      .filter((a) => a.is_required && (a.in_price_matrix === false || !product.price_attribute_ids?.length || product.price_attribute_ids.includes(a.id)))
      .filter((a) => !chosen.has(a.id))
      .map((a) => a.name);
    const category = categories.data?.find((c) => c.id === product.category_id);
    if (category?.extras_required) {
      const optionIds = (it.selected_options ?? []).map((o) => o.attribute_option_id);
      missing.push(...unansweredSections(chargeQueries[k]?.data ?? [], optionIds, it.extras_choices));
    }
    return missing;
  };

  const pricedLines = preview?.items ?? [];
  const total = preview ? Math.max(0, preview.subtotal - (preview.discount_amount ?? 0) + (withGst ? preview.tax_amount : 0)) : 0;
  const anyPriced = pricedLines.some((l) => l?.priceable);
  const allPriced = lines.length > 0 && lines.every(({ i }) => pricedLines[i]?.priceable);

  const rowLink = (row: BreakdownRow) => {
    const link = pricingLinkFor(row);
    if (!link) return null;
    return canEdit ? (
      <Link href={link} target="_blank" rel="noopener" underline="hover" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, fontSize: 12, whiteSpace: 'nowrap' }} data-testid="panel-edit-link" title="Check or change this rate">
        <EditIcon sx={{ fontSize: 13 }} /> change <OpenInNewIcon sx={{ fontSize: 12 }} />
      </Link>
    ) : null;
  };

  return (
    <Paper
      elevation={4}
      data-testid="price-panel"
      sx={{ borderRadius: 3, overflow: 'hidden', border: '2px solid #1a237e', maxHeight: { lg: 'calc(100vh - 110px)' }, display: 'flex', flexDirection: 'column' }}
    >
      <Box sx={{ bgcolor: '#1a237e', color: '#fff', px: 2, py: 1.25 }}>
        <Typography sx={{ fontSize: 12, letterSpacing: 1, opacity: 0.85, fontWeight: 700 }}>PRICE OF THIS ORDER</Typography>
        <Typography sx={{ fontSize: 34, fontWeight: 900, lineHeight: 1.1 }} data-testid="panel-total">
          {anyPriced ? `₹${money(total)}` : '₹ --'}
        </Typography>
        <Typography sx={{ fontSize: 12, opacity: 0.85 }}>
          {!anyPriced ? 'Choose the options to see the price' : withGst ? 'including GST' : 'no GST (cash bill)'}
          {anyPriced && !allPriced ? ' · some lines are not priced yet' : ''}
        </Typography>
      </Box>

      <Box sx={{ p: 1.5, overflowY: 'auto' }}>
        {lines.length === 0 && (
          <Typography variant="body2" color="text.secondary">Choose the item and its options on the left - each part of the price appears here as you go.</Typography>
        )}
        {lines.map(({ it, i }, n) => {
          const priced = pricedLines[i];
          const product = products.data?.find((p) => p.id === it!.product_id);
          const missing = priced?.priceable ? [] : missingFor(it!);
          return (
            <Box key={i} sx={{ mb: 1.5 }} data-testid="panel-line" data-priced={priced?.priceable ? 'true' : 'false'}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'baseline' }}>
                <Typography sx={{ fontWeight: 800, fontSize: 14 }}>{n + 1}. {product?.name ?? 'Item'}</Typography>
                <Typography sx={{ fontWeight: 900, fontSize: 15, color: priced?.priceable ? '#1b5e20' : 'text.disabled' }} data-testid="panel-line-total">
                  {priced?.priceable ? `₹${money(priced.total_price)}` : '--'}
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary">Quantity {Number(it!.quantity || 0).toLocaleString('en-IN')}{priced?.priceable ? ` · ₹${money(priced.unit_price)} each` : ''}</Typography>
              {priced?.priceable ? (
                <Box sx={{ mt: 0.75 }}>
                  {(priced.breakdown ?? []).map((row, k) => (
                    <Box key={k} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, py: 0.4, borderTop: '1px dashed #d5d9ee' }} data-testid="panel-part">
                      <Box sx={{ width: 5, alignSelf: 'stretch', borderRadius: 1, bgcolor: PART_COLOUR[row.kind] ?? '#546e7a', flexShrink: 0 }} />
                      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Typography component="div" sx={{ fontSize: 13, fontWeight: 700 }}>
                          {row.label}
                          <Chip size="small" label={PART_TITLE[row.kind] ?? row.kind} sx={{ ml: 0.75, height: 16, fontSize: 10, bgcolor: `${PART_COLOUR[row.kind] ?? '#546e7a'}18`, color: PART_COLOUR[row.kind] ?? '#546e7a' }} />
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.25 }}>{row.detail}</Typography>
                        {rowLink(row)}
                      </Box>
                      <Typography sx={{ fontSize: 13.5, fontWeight: 800, whiteSpace: 'nowrap' }}>₹{money(row.amount)}</Typography>
                    </Box>
                  ))}
                  {(priced.discount_amount ?? 0) > 0 && (
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.4, borderTop: '1px dashed #d5d9ee' }}>
                      <Typography sx={{ fontSize: 13, color: 'success.main', fontWeight: 700 }}>Discount (this line's share)</Typography>
                      <Typography sx={{ fontSize: 13, color: 'success.main', fontWeight: 800 }}>- ₹{money(priced.discount_amount!)}</Typography>
                    </Box>
                  )}
                </Box>
              ) : (
                <Box sx={{ mt: 0.5, p: 1, bgcolor: '#fff8e1', borderRadius: 1.5, border: '1px solid #ffe082' }} data-testid="panel-missing">
                  <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: '#e65100' }}>{priced?.message || 'Not priced yet'}</Typography>
                  {missing.length > 0 ? (
                    <Typography sx={{ fontSize: 12.5 }}>Still to choose: <b>{missing.join(', ')}</b></Typography>
                  ) : (
                    <Typography sx={{ fontSize: 12.5 }}>{priced ? 'There is no rate for this combination yet - the owner sets it in Pricing Setup.' : 'Working it out…'}</Typography>
                  )}
                </Box>
              )}
            </Box>
          );
        })}

        {anyPriced && preview && (
          <>
            <Divider sx={{ my: 1 }} />
            <Row label="Sub-total" value={`₹${money(preview.subtotal)}`} />
            {(preview.discount_amount ?? 0) > 0 && <Row label={discountLabel ?? 'Discount'} value={`- ₹${money(preview.discount_amount!)}`} colour="success.main" />}
            {withGst && (preview.tax_breakdown ?? []).map((t) => (
              <Box key={`${t.hsn_code}-${t.rate}`}>
                <Row label={`CGST ${t.rate / 2}%${t.hsn_code ? ` (HSN ${t.hsn_code})` : ''}`} value={`₹${money(t.tax / 2)}`} small />
                <Row label={`SGST ${t.rate / 2}%`} value={`₹${money(t.tax - t.tax / 2)}`} small />
              </Box>
            ))}
            {withGst && <Row label="GST total" value={`₹${money(preview.tax_amount)}`} />}
            <Divider sx={{ my: 1 }} />
            <Row label="TOTAL" value={`₹${money(total)}`} big />
            {advance > 0 && (
              <>
                <Row label="Advance received" value={`- ₹${money(advance)}`} colour="success.main" />
                <Row label="BALANCE TO PAY" value={`₹${money(Math.max(total - advance, 0))}`} big />
              </>
            )}
          </>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          {canEdit ? 'Starting prices: check each part and use "change" to set the real rate.' : 'Rates are kept by the owner in Pricing Setup.'}
        </Typography>
      </Box>
    </Paper>
  );
}

function Row({ label, value, big, small, colour }: { label: string; value: string; big?: boolean; small?: boolean; colour?: string }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, py: big ? 0.5 : 0.2 }}>
      <Typography sx={{ fontSize: big ? 15 : small ? 12 : 13.5, fontWeight: big ? 900 : small ? 400 : 700, color: colour ?? (small ? 'text.secondary' : 'inherit') }}>{label}</Typography>
      <Typography sx={{ fontSize: big ? 18 : small ? 12 : 13.5, fontWeight: big ? 900 : 700, color: colour ?? 'inherit' }} data-testid={big ? 'panel-grand' : undefined}>{value}</Typography>
    </Box>
  );
}
