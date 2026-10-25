import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { Alert, Box, Button, CircularProgress, FormControlLabel, Grid, Paper, Stack, Switch, TextField, Typography } from '@mui/material';
import { companyApi } from '../api/companyApi';
import { getErrorMessage } from '../utils/api';
import type { Company } from '../types/company';

const NUMBER_PROPS = { htmlInput: { min: 1, step: 1 } } as const;

/** The shop's own details, printed on the GST invoice, cash bill and delivery challan, plus the bill serial series. */
export default function CompanySettings() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['company'], queryFn: companyApi.get });
  const { control, register, handleSubmit, reset } = useForm<Company>();

  useEffect(() => {
    if (query.data) reset(query.data);
  }, [query.data, reset]);

  const save = useMutation({
    mutationFn: (data: Company) =>
      companyApi.update({
        ...data,
        next_gst_invoice_no: Number(data.next_gst_invoice_no),
        next_cash_bill_no: Number(data.next_cash_bill_no),
        next_challan_no: Number(data.next_challan_no),
      }),
    onSuccess: (row) => {
      queryClient.setQueryData(['company'], row);
      reset(row);
    },
  });

  if (query.isLoading) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;

  return (
    <Box sx={{ p: 3, maxWidth: 1000 }}>
      <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 1 }}>Company Details</Typography>
      <Alert severity="info" sx={{ mb: 2 }}>
        These details print at the top of every GST invoice, cash bill and delivery challan. The customer&apos;s own
        address and phone print only when they were entered with the order.
      </Alert>
      {save.isError && <Alert severity="error" sx={{ mb: 2 }}>{getErrorMessage(save.error, 'Could not save')}</Alert>}
      {save.isSuccess && !save.isPending && <Alert severity="success" sx={{ mb: 2 }}>Saved.</Alert>}

      <form onSubmit={handleSubmit((d) => save.mutate(d))}>
        <Paper sx={{ p: 3, borderRadius: 2, mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Shop</Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}><TextField label="Shop name" required fullWidth {...register('name', { required: true })} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField label="Tagline (under the logo)" fullWidth {...register('tagline')} /></Grid>
            <Grid size={{ xs: 12, md: 8 }}><TextField label="GSTIN" fullWidth {...register('gstin')} /></Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField label="State code" fullWidth helperText="First 2 digits of the GSTIN (33 = Tamil Nadu)" {...register('state_code')} />
            </Grid>
            <Grid size={{ xs: 12 }}><TextField label="Address" fullWidth multiline minRows={2} {...register('address')} /></Grid>
            <Grid size={{ xs: 12, md: 4 }}><TextField label="Mobile numbers" fullWidth {...register('phones')} /></Grid>
            <Grid size={{ xs: 12, md: 4 }}><TextField label="Landline" fullWidth {...register('landline')} /></Grid>
            <Grid size={{ xs: 12, md: 4 }}><TextField label="E-mail" fullWidth {...register('email')} /></Grid>
          </Grid>
        </Paper>

        <Paper sx={{ p: 3, borderRadius: 2, mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Bank details (printed on the GST invoice)</Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}><TextField label="Account name" fullWidth {...register('bank_account_name')} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField label="Account number" fullWidth {...register('bank_account_no')} /></Grid>
            <Grid size={{ xs: 12, md: 4 }}><TextField label="IFSC code" fullWidth {...register('bank_ifsc')} /></Grid>
            <Grid size={{ xs: 12, md: 4 }}><TextField label="Bank" fullWidth {...register('bank_name')} /></Grid>
            <Grid size={{ xs: 12, md: 4 }}><TextField label="Branch" fullWidth {...register('bank_branch')} /></Grid>
            <Grid size={{ xs: 12 }}>
              <Controller name="show_bank_on_invoice" control={control} render={({ field }) => (
                <FormControlLabel control={<Switch checked={Boolean(field.value)} onChange={(e) => field.onChange(e.target.checked)} />} label="Print the bank details on the GST invoice" />
              )} />
            </Grid>
          </Grid>
        </Paper>

        <Paper sx={{ p: 3, borderRadius: 2, mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>Bill numbers</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            The number the next bill gets. Set it to carry on from the printed bill books; it goes up by one with every bill.
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 4 }}><TextField label="Next GST invoice no." type="number" fullWidth slotProps={NUMBER_PROPS} {...register('next_gst_invoice_no', { valueAsNumber: true, min: 1 })} /></Grid>
            <Grid size={{ xs: 12, md: 4 }}><TextField label="Next cash bill no." type="number" fullWidth slotProps={NUMBER_PROPS} {...register('next_cash_bill_no', { valueAsNumber: true, min: 1 })} /></Grid>
            <Grid size={{ xs: 12, md: 4 }}><TextField label="Next delivery challan no." type="number" fullWidth slotProps={NUMBER_PROPS} {...register('next_challan_no', { valueAsNumber: true, min: 1 })} /></Grid>
          </Grid>
        </Paper>

        <Stack direction="row" spacing={2}>
          <Button type="submit" variant="contained" sx={{ bgcolor: '#1a237e' }} disabled={save.isPending}>Save</Button>
        </Stack>
      </form>
    </Box>
  );
}
