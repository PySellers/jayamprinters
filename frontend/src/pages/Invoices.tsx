import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody,
  Button, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, Alert,
  ToggleButton, ToggleButtonGroup, Stack, Select, MenuItem,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DownloadIcon from '@mui/icons-material/Download';
import { invoicesApi } from '../api/invoicesApi';
import type { InvoiceBillType } from '../api/invoicesApi';
import { getErrorMessage } from '../utils/api';
import { customersApi } from '../api/customersApi';
import { productsApi } from '../api/productsApi';
import { quotationsApi } from '../api/quotationsApi';
import EntitySelect from '../components/pickers/EntitySelect';
import ConfirmDialog from '../components/ConfirmDialog';
import type { Invoice } from '../types/invoices';
import type { InvoiceStatus } from '../types/common';

const STATUS_STYLE: Record<InvoiceStatus, { color: string; bg: string }> = {
  unpaid: { color: '#c62828', bg: '#fdecea' },
  partially_paid: { color: '#e65100', bg: '#fff3e0' },
  paid: { color: '#2e7d32', bg: '#e8f5e9' },
};

const money = (n: number) => `₹${n.toFixed(2)}`;

// One line per invoice item, so a multi-item order stays readable in the table.
function Lines({ values }: { values: (string | number)[] }) {
  return (
    <>
      {values.map((v, i) => (
        <Box key={i} sx={{ py: 0.25 }}>{v}</Box>
      ))}
    </>
  );
}

// Dropdown that replaces the old status chip: Unpaid <-> Paid.
function StatusSelect({
  invoice, disabled, onChange,
}: { invoice: Invoice; disabled: boolean; onChange: (status: InvoiceStatus) => void }) {
  const style = STATUS_STYLE[invoice.status];
  return (
    <Select
      size="small"
      value={invoice.status}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as InvoiceStatus)}
      sx={{
        minWidth: 140,
        fontWeight: 700,
        color: style.color,
        bgcolor: style.bg,
        '& .MuiSelect-select': { py: 0.75 },
      }}
    >
      <MenuItem value="unpaid">Unpaid</MenuItem>
      <MenuItem value="paid">Paid</MenuItem>
      {invoice.status === 'partially_paid' && (
        <MenuItem value="partially_paid" disabled>
          Partially paid
        </MenuItem>
      )}
    </Select>
  );
}

export default function Invoices() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedQuotationId, setSelectedQuotationId] = useState<number | null>(null);
  const [billType, setBillType] = useState<InvoiceBillType>('gst');
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [unpaidTarget, setUnpaidTarget] = useState<Invoice | null>(null);

  const invoicesQuery = useQuery({ queryKey: ['invoices'], queryFn: invoicesApi.list });
  const customersQuery = useQuery({ queryKey: ['customers'], queryFn: customersApi.list });
  const productsQuery = useQuery({ queryKey: ['products'], queryFn: productsApi.list });
  const quotationsQuery = useQuery({ queryKey: ['quotations'], queryFn: quotationsApi.list });

  const customerOf = (id: number) => customersQuery.data?.find((c) => c.id === id);
  const customerName = (id: number) => customerOf(id)?.name ?? `#${id}`;
  const productName = (id: number) => productsQuery.data?.find((p) => p.id === id)?.name ?? `#${id}`;
  const convertedQuotations = (quotationsQuery.data ?? []).filter((q) => q.status === 'converted');

  // A customer with a GSTIN gets the GST invoice, everyone else the cash bill.
  const isGstInvoice = (inv: Invoice) => Boolean(customerOf(inv.customer_id)?.gstin?.trim());
  const allInvoices = invoicesQuery.data ?? [];
  const gstInvoices = allInvoices.filter(isGstInvoice);
  const cashInvoices = allInvoices.filter((inv) => !isGstInvoice(inv));
  const rows = billType === 'gst' ? gstInvoices : cashInvoices;
  const columnCount = billType === 'gst' ? 11 : 9;

  const createMutation = useMutation({
    mutationFn: (quotationId: number) => invoicesApi.createFromQuotation(quotationId),
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setPickerOpen(false);
      setSelectedQuotationId(null);
      navigate(`/invoices/${invoice.id}`);
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: InvoiceStatus }) => invoicesApi.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setUnpaidTarget(null);
    },
    onError: (error) => {
      setActionError(getErrorMessage(error, 'Failed to update the status'));
      setUnpaidTarget(null);
    },
  });

  const handleStatusChange = (invoice: Invoice, next: InvoiceStatus) => {
    if (next === invoice.status) return;
    setActionError(null);
    if (next === 'unpaid') {
      setUnpaidTarget(invoice); // clears recorded payments, so ask first
    } else {
      statusMutation.mutate({ id: invoice.id, status: next });
    }
  };

  const runBillAction = async (key: string, action: () => Promise<void>) => {
    setActionError(null);
    setBusy(key);
    try {
      await action();
    } catch (error) {
      setActionError(getErrorMessage(error, 'Failed to open the bill'));
    } finally {
      setBusy(null);
    }
  };

  const nowrap = { whiteSpace: 'nowrap' } as const;

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

      <ToggleButtonGroup
        exclusive
        color="primary"
        value={billType}
        onChange={(_, value: InvoiceBillType | null) => value && setBillType(value)}
        sx={{ mb: 2, bgcolor: 'white' }}
      >
        <ToggleButton value="gst" sx={{ px: 3, fontWeight: 700 }}>
          With GST ({gstInvoices.length})
        </ToggleButton>
        <ToggleButton value="cash" sx={{ px: 3, fontWeight: 700 }}>
          Without GST ({cashInvoices.length})
        </ToggleButton>
      </ToggleButtonGroup>

      {actionError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}

      <Paper sx={{ borderRadius: 2, overflowX: 'auto' }}>
        {invoicesQuery.isLoading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <CircularProgress />
          </Box>
        ) : (
          <Table size="small" sx={{ '& th, & td': { px: 1.25, py: 1.25 } }}>
            <TableHead>
              {billType === 'gst' ? (
                <TableRow>
                  <TableCell sx={nowrap}>Invoice #</TableCell>
                  <TableCell>Customer</TableCell>
                  <TableCell>Particulars</TableCell>
                  <TableCell>Phone</TableCell>
                  <TableCell>Qty</TableCell>
                  <TableCell>Rate</TableCell>
                  <TableCell>Total</TableCell>
                  <TableCell>GST</TableCell>
                  <TableCell sx={nowrap}>Grand Total</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right" sx={nowrap}>View / Download</TableCell>
                </TableRow>
              ) : (
                <TableRow>
                  <TableCell sx={nowrap}>Invoice #</TableCell>
                  <TableCell>Customer</TableCell>
                  <TableCell>Particulars</TableCell>
                  <TableCell>Phone</TableCell>
                  <TableCell>Qty</TableCell>
                  <TableCell>Rate</TableCell>
                  <TableCell>Amount</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right" sx={nowrap}>View / Download</TableCell>
                </TableRow>
              )}
            </TableHead>
            <TableBody>
              {rows.map((inv) => {
                const customer = customerOf(inv.customer_id);
                const updating = statusMutation.isPending && statusMutation.variables?.id === inv.id;
                return (
                  <TableRow
                    key={inv.id}
                    hover
                    sx={{ cursor: 'pointer', verticalAlign: 'top' }}
                    onClick={() => navigate(`/invoices/${inv.id}`)}
                  >
                    <TableCell sx={nowrap}>{inv.invoice_number}</TableCell>
                    <TableCell>{customerName(inv.customer_id)}</TableCell>
                    <TableCell sx={{ minWidth: 140 }}>
                      <Lines values={inv.items.map((i) => productName(i.product_id))} />
                    </TableCell>
                    <TableCell sx={nowrap}>{customer?.phone || '-'}</TableCell>
                    <TableCell><Lines values={inv.items.map((i) => i.quantity)} /></TableCell>
                    <TableCell sx={nowrap}><Lines values={inv.items.map((i) => money(i.unit_price))} /></TableCell>
                    {billType === 'gst' ? (
                      <>
                        <TableCell sx={nowrap}>{money(inv.subtotal)}</TableCell>
                        <TableCell sx={nowrap}>{money(inv.tax_amount)}</TableCell>
                        <TableCell sx={{ ...nowrap, fontWeight: 700 }}>{money(inv.grand_total)}</TableCell>
                      </>
                    ) : (
                      <TableCell sx={nowrap}>{money(inv.subtotal)}</TableCell>
                    )}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <StatusSelect
                        invoice={inv}
                        disabled={updating}
                        onChange={(next) => handleStatusChange(inv, next)}
                      />
                    </TableCell>
                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={busy === `view-${inv.id}` ? <CircularProgress size={14} /> : <VisibilityIcon />}
                          disabled={busy !== null}
                          onClick={() => runBillAction(`view-${inv.id}`, () => invoicesApi.viewBill(inv.id, billType))}
                        >
                          View
                        </Button>
                        <Button
                          size="small"
                          variant="contained"
                          sx={{ bgcolor: '#1a237e' }}
                          startIcon={busy === `dl-${inv.id}` ? <CircularProgress size={14} color="inherit" /> : <DownloadIcon />}
                          disabled={busy !== null}
                          onClick={() =>
                            runBillAction(`dl-${inv.id}`, () => invoicesApi.downloadBill(inv.id, inv.invoice_number, billType))
                          }
                        >
                          Download
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={columnCount} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                    {billType === 'gst' ? 'No GST invoices yet.' : 'No cash bills (without GST) yet.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Paper>

      <ConfirmDialog
        open={Boolean(unpaidTarget)}
        title="Mark as Unpaid?"
        confirmLabel="Mark Unpaid"
        message={`This removes all payments recorded on ${unpaidTarget?.invoice_number ?? 'this invoice'} and puts the full amount back as due.`}
        loading={statusMutation.isPending}
        onConfirm={() => unpaidTarget && statusMutation.mutate({ id: unpaidTarget.id, status: 'unpaid' })}
        onCancel={() => setUnpaidTarget(null)}
      />

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