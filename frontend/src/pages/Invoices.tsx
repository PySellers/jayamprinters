import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody,
  Button, Chip, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, Alert,
  TablePagination,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { invoicesApi } from '../api/invoicesApi';
import { getErrorMessage } from '../utils/api';
import { customersApi } from '../api/customersApi';
import { quotationsApi } from '../api/quotationsApi';
import { useNotify } from '../context/NotificationContext';
import EntitySelect from '../components/pickers/EntitySelect';
import EmptyState from '../components/EmptyState';
import { usePagination } from '../hooks/usePagination';

const STATUS_COLORS: Record<string, 'default' | 'warning' | 'success'> = {
  unpaid: 'default',
  partially_paid: 'warning',
  paid: 'success',
};

export default function Invoices() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const notify = useNotify();
  const { page, rowsPerPage, paginate, handleChangePage, handleChangeRowsPerPage } = usePagination();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedQuotationId, setSelectedQuotationId] = useState<number | null>(null);

  const invoicesQuery = useQuery({ queryKey: ['invoices'], queryFn: invoicesApi.list });
  const customersQuery = useQuery({ queryKey: ['customers'], queryFn: customersApi.list });
  const quotationsQuery = useQuery({ queryKey: ['quotations'], queryFn: quotationsApi.list });

  const customerName = (id: number) => customersQuery.data?.find((c) => c.id === id)?.name ?? `#${id}`;
  const convertedQuotations = (quotationsQuery.data ?? []).filter((q) => q.status === 'converted');

  const createMutation = useMutation({
    mutationFn: (quotationId: number) => invoicesApi.createFromQuotation(quotationId),
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      notify('Invoice created');
      setPickerOpen(false);
      setSelectedQuotationId(null);
      navigate(`/invoices/${invoice.id}`);
    },
  });

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
          Invoices
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} sx={{ bgcolor: '#1a237e' }} onClick={() => setPickerOpen(true)}>
          New from Quotation
        </Button>
      </Box>

      <Paper sx={{ borderRadius: 2 }}>
        {invoicesQuery.isLoading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <CircularProgress />
          </Box>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Invoice #</TableCell>
                <TableCell>Customer</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Grand Total</TableCell>
                <TableCell>Paid</TableCell>
                <TableCell>Balance</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginate(invoicesQuery.data ?? []).map((inv) => (
                <TableRow key={inv.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/invoices/${inv.id}`)}>
                  <TableCell>{inv.invoice_number}</TableCell>
                  <TableCell>{customerName(inv.customer_id)}</TableCell>
                  <TableCell>
                    <Chip label={inv.order_type === 'offline' ? 'Walk-in' : 'Phone/Remote'} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>
                    <Chip label={inv.status.replace('_', ' ')} color={STATUS_COLORS[inv.status]} size="small" />
                  </TableCell>
                  <TableCell>₹{inv.grand_total.toFixed(2)}</TableCell>
                  <TableCell>₹{inv.amount_paid.toFixed(2)}</TableCell>
                  <TableCell>₹{(inv.grand_total - inv.amount_paid).toFixed(2)}</TableCell>
                </TableRow>
              ))}
              {(invoicesQuery.data ?? []).length === 0 && <EmptyState colSpan={7} message="No invoices yet." />}
            </TableBody>
          </Table>
        )}
        {(invoicesQuery.data ?? []).length > 0 && (
          <TablePagination
            component="div"
            count={invoicesQuery.data!.length}
            page={page}
            onPageChange={handleChangePage}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            rowsPerPageOptions={[10, 25, 50]}
          />
        )}
      </Paper>

      <Dialog open={pickerOpen} onClose={() => setPickerOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>New Invoice from Quotation</DialogTitle>
        <DialogContent>
          {createMutation.isError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {getErrorMessage(createMutation.error, 'Failed to create invoice')}
            </Alert>
          )}
          <Box sx={{ mt: 1 }}>
            <EntitySelect
              label="Converted Quotation"
              mode="list"
              queryKey="convertible-quotation-picker"
              fetchOptions={async () => convertedQuotations}
              getOptionLabel={(q) => q.quotation_number}
              value={selectedQuotationId}
              onChange={setSelectedQuotationId}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPickerOpen(false)} disabled={createMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={!selectedQuotationId || createMutation.isPending}
            onClick={() => selectedQuotationId && createMutation.mutate(selectedQuotationId)}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
