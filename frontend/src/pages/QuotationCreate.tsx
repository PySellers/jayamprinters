import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm, useFieldArray, Controller, FormProvider } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Autocomplete, Box, Typography, Paper, Button, TextField, Stack, Grid, Alert, ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { quotationsApi } from '../api/quotationsApi';
import { invoicesApi } from '../api/invoicesApi';
import { getErrorMessage } from '../utils/api';
import { customersApi } from '../api/customersApi';
import { taxesApi } from '../api/taxesApi';
import type { QuotationCreateInput, QuotationItemInput } from '../types/quotations';
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
        <Alert severity="info" sx={{ mb: 2 }}>
          Fill in the details for this service — submitting will generate the job card and invoice automatically.
        </Alert>
      )}

      {createMutation.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {errorText(createMutation.error, 'Failed to create quotation')}
        </Alert>
      )}

      <FormProvider {...methods}>
        <form onSubmit={handleSubmit(onSubmit)}>
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
              <Grid size={{ xs: 12 }}>
                <TextField label="Notes" fullWidth multiline rows={2} {...register('notes')} />
              </Grid>
            </Grid>
          </Paper>

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
              />
            );
          })}

          <Button startIcon={<AddIcon />} onClick={() => append(emptyItem)} sx={{ mb: 3 }}>
            Add Line Item
          </Button>

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