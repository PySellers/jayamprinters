import { useNavigate } from 'react-router-dom';
import { useForm, useFieldArray, Controller, FormProvider } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Paper, Button, TextField, Stack, Grid, Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { quotationsApi } from '../api/quotationsApi';
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

  const methods = useForm<QuotationCreateInput>({
    defaultValues: { customer_id: undefined, tax_id: null, notes: '', items: [emptyItem] },
  });
  const { control, register, handleSubmit } = methods;
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const createMutation = useMutation({
    mutationFn: (data: QuotationCreateInput) => quotationsApi.create(data),
    onSuccess: (quotation) => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      navigate(`/quotations/${quotation.id}`);
    },
  });

  const onSubmit = (data: QuotationCreateInput) => {
    createMutation.mutate({
      ...data,
      items: data.items.map((item) => ({ ...item, product_id: Number(item.product_id) })),
    });
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 3 }}>
        New Quotation
      </Typography>

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
                      getOptionLabel={(c) => `${c.name} (${c.phone})`}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
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
              Create Quotation
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
