import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm, useFieldArray, useWatch, Controller, FormProvider } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Autocomplete, Box, Typography, Paper, Button, TextField, Stack, Grid, Alert, ToggleButton, ToggleButtonGroup,
  Chip, Collapse,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { quotationsApi } from '../api/quotationsApi';
import { invoicesApi } from '../api/invoicesApi';
import { getErrorMessage } from '../utils/api';
import { customersApi } from '../api/customersApi';
import { taxesApi } from '../api/taxesApi';
import type { QuotationCreateInput, QuotationItemInput, QuotationPreview } from '../types/quotations';
import type { Customer, CustomerInput } from '../types/customers';
import EntitySelect from '../components/pickers/EntitySelect';
import QuotationLineItem from '../components/quotations/QuotationLineItem';
import BillBookWizard from '../components/quotations/BillBookWizard';
import ServiceItemPicker from '../components/quotations/ServiceItemPicker';
import { productsApi, productCategoriesApi } from '../api/productsApi';

const emptyItem: QuotationItemInput = {
  product_id: 0,
  quantity: 1,
  selected_options: [],
  extra_charge_ids: [],
};

const emptyContact = { phone: '', email: '', address: '' };

const formatDay = (d?: string | null) =>
  d ? new Date(`${d}T00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// Errors thrown by our own code carry a message; server errors carry response.data.detail.
const errorText = (err: unknown, fallback: string) =>
  err instanceof Error && !(err as { response?: unknown }).response ? err.message : getErrorMessage(err, fallback);

export default function QuotationCreate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  // "Start New Order" lands here with quick=1: it skips the quotation stage and
  // goes straight to an invoice. A normal New Quotation stays on the Quotations page.
  const isQuick = searchParams.get('quick') === '1';
  const initialCustomerId = searchParams.get('customerId');
  const initialProductId = searchParams.get('productId');
  // Start New Order picks a service (category); the item/options are chosen on this screen.
  const serviceCategoryId = searchParams.get('categoryId') ? Number(searchParams.get('categoryId')) : null;
  const initialProof1Date = searchParams.get('proof1Date');
  const initialProof1Time = searchParams.get('proof1Time');
  const initialProof2Date = searchParams.get('proof2Date');
  const initialProof2Time = searchParams.get('proof2Time');
  const withGstParam = searchParams.get('withGst');
  const initialWithGst = withGstParam === null ? true : withGstParam === '1';
  const initialDeliveryDate = searchParams.get('deliveryDate');
  const initialDeliveryTime = searchParams.get('deliveryTime');

  const methods = useForm<QuotationCreateInput>({
    defaultValues: {
      customer_id: initialCustomerId ? Number(initialCustomerId) : undefined,
      tax_id: null,
      notes: '',
      with_gst: initialWithGst,
      proof1_date: initialProof1Date || undefined,
      proof1_time: initialProof1Time || undefined,
      proof2_date: initialProof2Date || undefined,
      proof2_time: initialProof2Time || undefined,
      delivery_date: initialDeliveryDate || undefined,
      delivery_time: initialDeliveryTime || undefined,
      items: [initialProductId ? { ...emptyItem, product_id: Number(initialProductId) } : emptyItem],
    },
  });
  const { control, register, handleSubmit } = methods;
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const withGst = methods.watch('with_gst');

  // ---- live price: the same calculation the saved order will use ----------------
  const watchedItems = useWatch({ control, name: 'items' });
  const watchedTaxId = useWatch({ control, name: 'tax_id' });
  const [preview, setPreview] = useState<QuotationPreview | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const lines = (watchedItems ?? []).map((it) => (it && it.product_id ? it : null));
    if (!lines.some(Boolean)) {
      setPreview(null);
      return;
    }
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => {
      // Keep line positions: an unpicked line is sent as nothing and shown as "not priced yet".
      const picked = lines.filter((l): l is QuotationItemInput => l !== null);
      quotationsApi
        .preview({ tax_id: watchedTaxId, items: picked })
        .then((result) => {
          let k = 0;
          const items = lines.map((l) => (l ? result.items[k++] : { unit_price: 0, total_price: 0, priceable: false }));
          setPreview({ ...result, items });
        })
        .catch(() => setPreview(null));
    }, 300);
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(watchedItems), watchedTaxId]);
  const allPriced = Boolean(preview) && (preview?.items ?? []).every((i) => i.priceable);
  const gstAmount = withGst ? preview?.tax_amount ?? 0 : 0;

  // ---- service -> item (step 2 of Start New Order) ----------------------------
  const categoriesQuery = useQuery({ queryKey: ['product-categories'], queryFn: productCategoriesApi.list });
  const productsListQuery = useQuery({ queryKey: ['product-picker', 'list'], queryFn: productsApi.list });
  const serviceCategory = categoriesQuery.data?.find((c) => c.id === serviceCategoryId);
  const serviceProducts = (productsListQuery.data ?? []).filter((p) => p.category_id === serviceCategoryId && p.is_active);
  const firstProductId = methods.watch('items.0.product_id');
  const isBillBookFlow = serviceCategory?.guided_flow === 'bill_book';
  // A service with a single item has nothing to choose between: skip that screen.
  useEffect(() => {
    if (!isBillBookFlow && serviceProducts.length === 1 && !firstProductId) {
      methods.setValue('items.0.product_id', serviceProducts[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBillBookFlow, serviceProducts.length, firstProductId]);

  // ---- customer: pick an existing one OR type a brand-new name ----------------
  const [nameInput, setNameInput] = useState('');
  // Start New Order already captured the customer and dates, so the full details form stays folded away.
  const [showDetails, setShowDetails] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [contact, setContact] = useState(emptyContact);

  // Start New Order already created / chose the customer: load it and show it.
  const quickCustomerQuery = useQuery({
    queryKey: ['customers', 'detail', initialCustomerId],
    queryFn: () => customersApi.get(Number(initialCustomerId)),
    enabled: isQuick && Boolean(initialCustomerId),
  });
  useEffect(() => {
    if (quickCustomerQuery.data) {
      setSelectedCustomer(quickCustomerQuery.data);
      setNameInput(quickCustomerQuery.data.name);
    }
  }, [quickCustomerQuery.data]);

  // Choosing an existing customer fills in their saved phone / email / address.
  useEffect(() => {
    if (selectedCustomer) {
      setContact({
        phone: selectedCustomer.phone ?? '',
        email: selectedCustomer.email ?? '',
        address: selectedCustomer.address ?? '',
      });
    }
  }, [selectedCustomer]);

  const term = nameInput.trim();
  const searchQuery = useQuery({
    queryKey: ['customer-name-search', term],
    queryFn: () => customersApi.search(term),
    enabled: !isQuick && term.length >= 1,
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: async (data: QuotationCreateInput) => {
      let customerId: number;
      const phone = contact.phone.trim();
      const email = contact.email.trim();
      const address = contact.address.trim();

      if (selectedCustomer) {
        // Existing customer: save any phone / email / address change first.
        customerId = selectedCustomer.id;
        const changes: Partial<CustomerInput> = {};
        if ((selectedCustomer.phone ?? '') !== phone) changes.phone = phone || null;
        if ((selectedCustomer.email ?? '') !== email) changes.email = email || null;
        if ((selectedCustomer.address ?? '') !== address) changes.address = address || null;
        if (Object.keys(changes).length > 0) await customersApi.update(selectedCustomer.id, changes);
      } else {
        // New customer: create them from the typed name and contact details.
        const name = nameInput.trim();
        if (!name) throw new Error('Enter the customer name');
        if (phone) {
          const sameNumber = (await customersApi.search(phone)).find((c) => (c.phone ?? '').trim() === phone);
          if (sameNumber) {
            throw new Error(
              `This phone number already belongs to "${sameNumber.name}". Pick that customer from the name list instead.`,
            );
          }
        }
        const created = await customersApi.create({
          name,
          phone: phone || null,
          email: email || null,
          address: address || null,
        });
        customerId = created.id;
      }
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      return quotationsApi.create({ ...data, customer_id: customerId, is_order: isQuick });
    },
    onSuccess: async (quotation) => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      if (isQuick) {
        await quotationsApi.convert(quotation.id);
        const invoice = await invoicesApi.createFromQuotation(quotation.id);
        queryClient.invalidateQueries({ queryKey: ['job-cards'] });
        queryClient.invalidateQueries({ queryKey: ['invoices'] });
        navigate(`/invoices/${invoice.id}`);
      } else {
        // A quotation waits on the Quotations page until it is approved and invoiced from there.
        navigate('/quotations');
      }
    },
  });

  const onSubmit = (data: QuotationCreateInput) => {
    createMutation.mutate({
      ...data,
      // An unfilled <input type="date">/<input type="time"> registers as "" in
      // react-hook-form, not undefined — the backend rejects "" as an invalid
      // date, so these optional fields are normalized to undefined.
      proof1_date: data.proof1_date || undefined,
      proof1_time: data.proof1_time || undefined,
      proof2_date: data.proof2_date || undefined,
      proof2_time: data.proof2_time || undefined,
      delivery_date: data.delivery_date || undefined,
      delivery_time: data.delivery_time || undefined,
      items: data.items.map((item) => ({ ...item, product_id: Number(item.product_id) })),
    });
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 3 }}>
        {isQuick ? 'Complete Order' : 'New Quotation'}
      </Typography>
      {isQuick && (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Typography sx={{ fontWeight: 800, color: '#1a237e', fontSize: '1.1rem' }}>{nameInput || 'Customer'}</Typography>
            <Chip size="small" color={withGst ? 'primary' : 'default'} label={withGst ? 'With GST' : 'Without GST'} sx={{ fontWeight: 700 }} />
            <Typography variant="body2" color="text.secondary">
              Proof 1: {formatDay(methods.watch('proof1_date'))}{methods.watch('proof1_time') ? `, ${methods.watch('proof1_time')}` : ''}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Delivery: {formatDay(methods.watch('delivery_date'))}{methods.watch('delivery_time') ? `, ${methods.watch('delivery_time')}` : ''}
            </Typography>
            <Button size="small" sx={{ ml: 'auto' }} onClick={() => setShowDetails((v) => !v)}>
              {showDetails ? 'Hide details' : 'Edit details'}
            </Button>
          </Box>
          <TextField label="Notes (optional)" fullWidth size="small" multiline minRows={1} maxRows={4} sx={{ mt: 1.5 }} {...register('notes')} />
        </Paper>
      )}

      {createMutation.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {errorText(createMutation.error, 'Failed to create quotation')}
        </Alert>
      )}

      <FormProvider {...methods}>
        <form onSubmit={handleSubmit(onSubmit)}>
          <Collapse in={!isQuick || showDetails}>
          <Paper sx={{ p: 3, borderRadius: 2, mb: 3 }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                {isQuick ? (
                  <TextField label="Customer" value={nameInput} fullWidth disabled />
                ) : (
                  <Autocomplete<Customer, false, false, true>
                    freeSolo
                    options={searchQuery.data ?? []}
                    filterOptions={(options) => options}
                    getOptionLabel={(option) => (typeof option === 'string' ? option : option.name)}
                    value={selectedCustomer}
                    inputValue={nameInput}
                    onInputChange={(_, value, reason) => {
                      setNameInput(value);
                      // Typing over an existing pick turns it into a new-customer entry.
                      if (reason === 'input' && selectedCustomer && value !== selectedCustomer.name) {
                        setSelectedCustomer(null);
                        setContact(emptyContact);
                      }
                    }}
                    onChange={(_, value) => {
                      if (value && typeof value !== 'string') setSelectedCustomer(value);
                      else if (!value) {
                        setSelectedCustomer(null);
                        setContact(emptyContact);
                      }
                    }}
                    renderOption={(props, option) => {
                      const { key, ...rest } = props as typeof props & { key: string };
                      return (
                        <li key={key} {...rest}>
                          {option.name}
                          {option.phone ? ` (${option.phone})` : ''}
                        </li>
                      );
                    }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Customer Name"
                        required
                        helperText={
                          selectedCustomer
                            ? 'Existing customer'
                            : term
                              ? 'New customer — will be added when you create the quotation'
                              : 'Type a new name, or pick an existing customer'
                        }
                      />
                    )}
                  />
                )}
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Phone Number"
                  fullWidth
                  value={contact.phone}
                  onChange={(e) => setContact({ ...contact, phone: e.target.value })}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Email ID"
                  type="email"
                  fullWidth
                  value={contact.email}
                  onChange={(e) => setContact({ ...contact, email: e.target.value })}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Controller
                  name="with_gst"
                  control={control}
                  render={({ field }) => (
                    <ToggleButtonGroup
                      exclusive
                      fullWidth
                      color="primary"
                      sx={{ height: 56 }}
                      value={field.value ? 'gst' : 'cash'}
                      onChange={(_, value: 'gst' | 'cash' | null) => value && field.onChange(value === 'gst')}
                    >
                      <ToggleButton value="gst" sx={{ fontWeight: 700 }}>With GST</ToggleButton>
                      <ToggleButton value="cash" sx={{ fontWeight: 700 }}>Without GST</ToggleButton>
                    </ToggleButtonGroup>
                  )}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField
                  label="Address"
                  fullWidth
                  multiline
                  rows={2}
                  value={contact.address}
                  onChange={(e) => setContact({ ...contact, address: e.target.value })}
                />
              </Grid>
              {withGst && (
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Controller
                    name="tax_id"
                    control={control}
                    render={({ field }) => (
                      <EntitySelect
                        label="Tax (defaults to GST 18%)"
                        mode="list"
                        queryKey="tax-picker"
                        fetchOptions={taxesApi.list}
                        getOptionLabel={(t) => `${t.name} (${t.rate_percent}%)`}
                        value={field.value}
                        onChange={field.onChange}
                      />
                    )}
                  />
                </Grid>
              )}
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Proof 1 Date"
                  type="date"
                  fullWidth
                  slotProps={{ inputLabel: { shrink: true } }}
                  {...register('proof1_date')}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Proof 1 Time"
                  type="time"
                  fullWidth
                  slotProps={{ inputLabel: { shrink: true } }}
                  {...register('proof1_time')}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Proof 2 Date (optional)"
                  type="date"
                  fullWidth
                  slotProps={{ inputLabel: { shrink: true } }}
                  {...register('proof2_date')}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Proof 2 Time (optional)"
                  type="time"
                  fullWidth
                  slotProps={{ inputLabel: { shrink: true } }}
                  {...register('proof2_time')}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Delivery Date"
                  type="date"
                  fullWidth
                  slotProps={{ inputLabel: { shrink: true } }}
                  {...register('delivery_date')}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Delivery Time"
                  type="time"
                  fullWidth
                  slotProps={{ inputLabel: { shrink: true } }}
                  {...register('delivery_time')}
                />
              </Grid>
              {!isQuick && (
                <Grid size={{ xs: 12 }}>
                  <TextField label="Notes" fullWidth multiline rows={2} {...register('notes')} />
                </Grid>
              )}
            </Grid>
          </Paper>
          </Collapse>

          <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 2 }}>
            Line Items
          </Typography>

          {fields.map((field, index) => {
            if (index === 0 && serviceCategoryId != null) {
              if (!serviceCategory || productsListQuery.isLoading) return null;
              if (isBillBookFlow) {
                return <BillBookWizard key={field.id} index={0} categoryId={serviceCategory.id} />;
              }
              if (!firstProductId && serviceProducts.length > 1) {
                return (
                  <ServiceItemPicker
                    key={field.id}
                    serviceName={serviceCategory.name}
                    products={serviceProducts}
                    onPick={(id) => methods.setValue('items.0.product_id', id, { shouldDirty: true })}
                  />
                );
              }
            }
            return (
              <QuotationLineItem
                key={field.id}
                index={index}
                onRemove={() => remove(index)}
                canRemove={fields.length > 1}
                previewItem={preview?.items[index]}
              />
            );
          })}

          <Button startIcon={<AddIcon />} onClick={() => append(emptyItem)} sx={{ mb: 3 }}>
            Add Line Item
          </Button>

          {preview && (
            <Paper variant="outlined" sx={{ p: 2, mb: 3, maxWidth: 360, ml: 'auto' }} data-testid="order-total">
              <Stack spacing={0.5}>
                <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                  <Typography color="text.secondary">Subtotal</Typography>
                  <Typography>₹{preview.subtotal.toFixed(2)}</Typography>
                </Stack>
                {withGst && (
                  <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                    <Typography color="text.secondary">GST</Typography>
                    <Typography>₹{gstAmount.toFixed(2)}</Typography>
                  </Stack>
                )}
                <Stack direction="row" sx={{ justifyContent: 'space-between', pt: 0.5, borderTop: '1px solid', borderColor: 'divider' }}>
                  <Typography sx={{ fontWeight: 'bold' }}>Total</Typography>
                  <Typography sx={{ fontWeight: 'bold' }}>
                    ₹{(preview.subtotal + gstAmount).toFixed(2)}
                  </Typography>
                </Stack>
                {!allPriced && (
                  <Typography variant="caption" color="warning.main">
                    Some lines are not priced yet — complete their options to include them.
                  </Typography>
                )}
              </Stack>
            </Paper>
          )}

          <Stack direction="row" spacing={2}>
            <Button
              type="submit"
              variant="contained"
              sx={{ bgcolor: '#1a237e' }}
              disabled={createMutation.isPending}
            >
              {isQuick ? 'Generate Invoice' : 'Create Quotation'}
            </Button>
            <Button onClick={() => navigate(isQuick ? '/dashboard' : '/quotations')} disabled={createMutation.isPending}>
              Cancel
            </Button>
          </Stack>
        </form>
      </FormProvider>
    </Box>
  );
}