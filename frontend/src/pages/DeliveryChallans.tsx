import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody,
  Button, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions,
  Stack, TextField, MenuItem, Chip, Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { deliveryChallansApi } from '../api/deliveryChallansApi';
import { invoicesApi } from '../api/invoicesApi';
import { customersApi } from '../api/customersApi';
import { getErrorMessage } from '../utils/api';
import { useNotify } from '../context/NotificationContext';
import EntitySelect from '../components/pickers/EntitySelect';
import EmptyState from '../components/EmptyState';
import type { DeliveryChallanInput } from '../types/deliveryChallans';
import type { DeliveryChallanBillType } from '../types/common';

const BILL_TYPES: DeliveryChallanBillType[] = ['cash_bill', 'tax_gst_bill'];

export default function DeliveryChallans() {
  const queryClient = useQueryClient();
  const notify = useNotify();
  const [dialogOpen, setDialogOpen] = useState(false);

  const challansQuery = useQuery({ queryKey: ['delivery-challans'], queryFn: deliveryChallansApi.list });
  const invoicesQuery = useQuery({ queryKey: ['invoices'], queryFn: invoicesApi.list });
  const customersQuery = useQuery({ queryKey: ['customers'], queryFn: customersApi.list });

  const invoiceNumber = (id: number) => invoicesQuery.data?.find((i) => i.id === id)?.invoice_number ?? `#${id}`;
  const customerForInvoice = (id: number) => {
    const inv = invoicesQuery.data?.find((i) => i.id === id);
    if (!inv) return '-';
    return customersQuery.data?.find((c) => c.id === inv.customer_id)?.name ?? `#${inv.customer_id}`;
  };

  const { control, register, handleSubmit, reset } = useForm<DeliveryChallanInput>({
    defaultValues: { invoice_id: 0, bill_type: 'cash_bill', vehicle_number: '', transporter_name: '', notes: '' },
  });

  const createMutation = useMutation({
    mutationFn: (data: DeliveryChallanInput) => deliveryChallansApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-challans'] });
      notify('Delivery challan created');
      setDialogOpen(false);
      reset({ invoice_id: 0, bill_type: 'cash_bill', vehicle_number: '', transporter_name: '', notes: '' });
    },
    onError: (error) => notify(getErrorMessage(error, 'Failed to create delivery challan'), 'error'),
  });

  const openCreate = () => {
    reset({ invoice_id: 0, bill_type: 'cash_bill', vehicle_number: '', transporter_name: '', notes: '' });
    setDialogOpen(true);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
          Delivery Challans
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} sx={{ bgcolor: '#1a237e' }} onClick={openCreate}>
          New Challan
        </Button>
      </Box>

      <Paper sx={{ borderRadius: 2, overflowX: 'auto' }}>
        {challansQuery.isLoading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <CircularProgress />
          </Box>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Challan #</TableCell>
                <TableCell>Invoice</TableCell>
                <TableCell>Customer</TableCell>
                <TableCell>Bill Type</TableCell>
                <TableCell>Vehicle No.</TableCell>
                <TableCell>Delivery Date</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(challansQuery.data ?? []).map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.challan_number}</TableCell>
                  <TableCell>{invoiceNumber(c.invoice_id)}</TableCell>
                  <TableCell>{customerForInvoice(c.invoice_id)}</TableCell>
                  <TableCell>
                    <Chip label={c.bill_type === 'tax_gst_bill' ? 'Tax (GST) Bill' : 'Cash Bill'} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>{c.vehicle_number || '-'}</TableCell>
                  <TableCell>{c.delivery_date}</TableCell>
                </TableRow>
              ))}
              {(challansQuery.data ?? []).length === 0 && <EmptyState colSpan={6} message="No delivery challans yet." />}
            </TableBody>
          </Table>
        )}
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <form onSubmit={handleSubmit((data) => createMutation.mutate({ ...data, invoice_id: Number(data.invoice_id) }))}>
          <DialogTitle>New Delivery Challan</DialogTitle>
          <DialogContent>
            {createMutation.isError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {getErrorMessage(createMutation.error, 'Failed to create delivery challan')}
              </Alert>
            )}
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Controller
                name="invoice_id"
                control={control}
                rules={{ required: true }}
                render={({ field }) => (
                  <EntitySelect
                    label="Invoice"
                    required
                    mode="list"
                    queryKey="invoice-picker"
                    fetchOptions={invoicesApi.list}
                    getOptionLabel={(i) => i.invoice_number}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
              <Controller
                name="bill_type"
                control={control}
                render={({ field }) => (
                  <TextField label="Bill Type" select fullWidth {...field}>
                    {BILL_TYPES.map((t) => (
                      <MenuItem key={t} value={t}>{t === 'tax_gst_bill' ? 'Tax (GST) Bill' : 'Cash Bill'}</MenuItem>
                    ))}
                  </TextField>
                )}
              />
              <TextField label="Vehicle Number" fullWidth {...register('vehicle_number')} />
              <TextField label="Transporter Name" fullWidth {...register('transporter_name')} />
              <TextField label="Notes" fullWidth multiline rows={2} {...register('notes')} />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)} disabled={createMutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={createMutation.isPending}>
              Save
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
}
