import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm, useFieldArray, Controller, FormProvider } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Paper, Button, TextField, Stack, Grid, Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { quotationsApi } from '../api/quotationsApi';
import { invoicesApi } from '../api/invoicesApi';
import { getErrorMessage } from '../utils/api';
import { customersApi } from '../api/customersApi';
import { taxesApi } from '../api/taxesApi';
import type { QuotationCreateInput, QuotationItemInput } from '../types/quotations';
import EntitySelect from '../components/pickers/EntitySelect';
import QuotationLineItem from '../components/quotations/QuotationLineItem';

const emptyItem: QuotationItemInput = {
  product_id: 0,
  quantity: 1,
  selected_options: [],
  extra_charge_ids: [],
};

export default function QuotationCreate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const isQuick = searchParams.get('quick') === '1';
  const initialCustomerId = searchParams.get('customerId');
  const initialCustomerName = searchParams.get('customerName');
  const initialProductId = searchParams.get('productId');
  const initialDeliveryDate = searchParams.get('deliveryDate');
  const initialDeliveryTime = searchParams.get('deliveryTime');

  const methods = useForm<QuotationCreateInput>({
    defaultValues: {
      customer_id: initialCustomerId ? Number(initialCustomerId) : undefined,
      tax_id: null,
      notes: '',
      delivery_date: initialDeliveryDate || undefined,
      delivery_time: initialDeliveryTime || undefined,
      items: [initialProductId ? { ...emptyItem, product_id: Number(initialProductId) } : emptyItem],
    },
  });
  const { control, register, handleSubmit } = methods;
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const createMutation = useMutation({
    mutationFn: (data: QuotationCreateInput) => quotationsApi.create(data),
    onSuccess: async (quotation) => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      if (isQuick) {
        await quotationsApi.convert(quotation.id);
        const invoice = await invoicesApi.createFromQuotation(quotation.id);
        queryClient.invalidateQueries({ queryKey: ['job-cards'] });
        queryClient.invalidateQueries({ queryKey: ['invoices'] });
        navigate(`/invoices/${invoice.id}`);
      } else {
        navigate(`/quotations/${quotation.id}`);
      }
    },
  });

  const onSubmit = (data: QuotationCreateInput) => {
    createMutation.mutate({
      ...data,
      // An unfilled <input type="date">/<input type="time"> registers as "" in
      // react-hook-form, not undefined — the backend rejects "" as an invalid
      // date, so these fields (which are optional, no * in their labels) must
      // be normalized to undefined before hitting the API.
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
          {getErrorMessage(createMutation.error, 'Failed to create quotation')}
        </Alert>
      )}

      <FormProvider {...methods}>
        <form onSubmit={handleSubmit(onSubmit)}>
          <Paper sx={{ p: 3, borderRadius: 2, mb: 3 }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                {isQuick && initialCustomerName ? (
                  <TextField label="Customer" value={initialCustomerName} fullWidth size="small" disabled />
                ) : (
                  <Controller
                    name="customer_id"
                    control={control}
                    rules={{ required: true }}
                    render={({ field }) => (
                      <EntitySelect
                        label="Customer"
                        required
                        mode="search"
                        queryKey="customer-picker"
                        searchOptions={customersApi.search}
                        getOptionLabel={(c) => `${c.name}${c.phone ? ` (${c.phone})` : ''}`}
                        value={field.value}
                        onChange={field.onChange}
                      />
                    )}
                  />
                )}
              </Grid>
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

          {fields.map((field, index) => (
            <QuotationLineItem
              key={field.id}
              index={index}
              onRemove={() => remove(index)}
              canRemove={fields.length > 1}
            />
          ))}

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
            <Button onClick={() => navigate('/quotations')} disabled={createMutation.isPending}>
              Cancel
            </Button>
          </Stack>
        </form>
      </FormProvider>
    </Box>
  );
}
