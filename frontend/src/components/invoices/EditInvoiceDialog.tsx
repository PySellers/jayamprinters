import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Grid, IconButton,
  InputAdornment, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import UndoIcon from '@mui/icons-material/Undo';
import { invoicesApi } from '../../api/invoicesApi';
import { getErrorMessage } from '../../utils/api';
import type { InvoiceEditLine, InvoiceEditRequest } from '../../types/invoices';

const money = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Text boxes keep what is typed; numbers are parsed only when the amounts are worked out. */
interface Row {
  key: number;
  id: number | null;
  particulars: string;
  hsn_code: string;
  quantity: string;
  unit_price: string;
  cgst_rate: string;
  sgst_rate: string;
}

const num = (v: string) => (v.trim() === '' || Number.isNaN(Number(v)) ? 0 : Number(v));

interface Props {
  invoiceId: number | null;
  invoiceNumber?: string;
  onClose: () => void;
  onSaved?: () => void;
}

/** Edit Invoice: customer details, invoice date and every row of the bill (particulars, HSN / SAC, qty, rate, CGST, SGST).
 *  Amounts and totals are worked out again as you type; saving updates the invoice, its PDF and the print. */
export default function EditInvoiceDialog({ invoiceId, invoiceNumber, onClose, onSaved }: Props) {
  const queryClient = useQueryClient();
  const open = invoiceId != null;
  const formQuery = useQuery({
    queryKey: ['invoice-edit-form', invoiceId],
    queryFn: () => invoicesApi.editForm(invoiceId!),
    enabled: open,
    gcTime: 0,
  });
  const form = formQuery.data;

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [gstin, setGstin] = useState('');
  const [address, setAddress] = useState('');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [finalText, setFinalText] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [nextKey, setNextKey] = useState(1);

  useEffect(() => {
    if (!form) return;
    setName(form.bill_to_name);
    setPhone(form.bill_to_phone);
    setGstin(form.bill_to_gstin);
    setAddress(form.bill_to_address);
    setDate(form.invoice_date);
    setNotes(form.notes ?? '');
    setFinalText(form.final_amount != null ? String(form.final_amount) : '');
    setRows(form.items.map((it, i) => ({
      key: i + 1, id: it.id ?? null, particulars: it.particulars, hsn_code: it.hsn_code ?? '',
      quantity: String(it.quantity), unit_price: String(it.unit_price), cgst_rate: String(it.cgst_rate), sgst_rate: String(it.sgst_rate),
    })));
    setNextKey(form.items.length + 1);
    setSubmitted(false);
  }, [form]);

  const withGst = Boolean(form?.with_gst);

  const payload: InvoiceEditRequest = useMemo(() => ({
    bill_to_name: name,
    bill_to_address: address,
    bill_to_gstin: withGst ? gstin.trim().toUpperCase() : gstin,
    bill_to_phone: phone,
    invoice_date: date || null,
    notes,
    final_amount: finalText.trim() === '' ? null : num(finalText),
    items: rows.map<InvoiceEditLine>((r) => ({
      id: r.id, particulars: r.particulars, hsn_code: r.hsn_code.trim() || null,
      quantity: Math.max(1, Math.round(num(r.quantity))), unit_price: num(r.unit_price),
      cgst_rate: withGst ? num(r.cgst_rate) : 0, sgst_rate: withGst ? num(r.sgst_rate) : 0,
    })),
  }), [name, address, gstin, phone, date, notes, finalText, rows, withGst]);

  const rowErrors = rows.map((r) => ({
    particulars: !r.particulars.trim() ? 'Required' : '',
    quantity: !(Number(r.quantity) >= 1) ? 'At least 1' : '',
    unit_price: r.unit_price.trim() === '' || !(Number(r.unit_price) >= 0) ? 'Enter the rate' : '',
    cgst_rate: withGst && !(num(r.cgst_rate) >= 0 && num(r.cgst_rate) <= 50) ? '0 - 50' : '',
    sgst_rate: withGst && !(num(r.sgst_rate) >= 0 && num(r.sgst_rate) <= 50) ? '0 - 50' : '',
  }));
  const rowsValid = rows.length > 0 && rowErrors.every((e) => !Object.values(e).some(Boolean));
  const nameError = !name.trim() ? 'The customer name is required' : '';
  const gstinError = withGst && gstin.trim() && !GSTIN_RE.test(gstin.trim().toUpperCase()) ? '15 characters, e.g. 33AAAAA0000A1Z5' : '';
  const finalError = finalText.trim() !== '' && !(num(finalText) >= 0) ? 'Enter a valid amount' : '';
  const valid = rowsValid && !nameError && !gstinError && !finalError;

  // ---- live re-calculation on the server, so the window, the saved invoice and the PDF always agree ----
  const [debounced, setDebounced] = useState<InvoiceEditRequest | null>(null);
  useEffect(() => {
    if (!form || !rowsValid || finalError) return undefined;
    const t = setTimeout(() => setDebounced(payload), 250);
    return () => clearTimeout(t);
  }, [payload, form, rowsValid, finalError]);
  const previewQuery = useQuery({
    queryKey: ['invoice-edit-preview', invoiceId, debounced],
    queryFn: () => invoicesApi.previewEdit(invoiceId!, debounced!),
    enabled: open && Boolean(debounced),
    placeholderData: (previous) => previous,
  });
  const preview = previewQuery.data;

  const saveMutation = useMutation({
    mutationFn: () => invoicesApi.saveEdit(invoiceId!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      onSaved?.();
      onClose();
    },
  });

  function update(key: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, { key: nextKey, id: null, particulars: '', hsn_code: '', quantity: '1', unit_price: '', cgst_rate: '', sgst_rate: '' }]);
    setNextKey((k) => k + 1);
  }
  function handleSave() {
    setSubmitted(true);
    if (!valid) return;
    saveMutation.mutate();
  }

  const showErr = (msg: string) => submitted && Boolean(msg);
  const small = { size: 'small' as const, fullWidth: true };
  const cell = { px: 0.75, py: 0.75, verticalAlign: 'top' } as const;
  const line = (index: number) => preview?.lines[index];
  const amountOf = (r: Row) => Math.round(Math.max(1, num(r.quantity)) * num(r.unit_price) * 100) / 100;

  return (
    <Dialog open={open} onClose={saveMutation.isPending ? undefined : onClose} maxWidth="lg" fullWidth data-testid="edit-invoice-dialog">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        Edit invoice {invoiceNumber ?? ''}
        {form && <Chip size="small" color={withGst ? 'primary' : 'default'} label={withGst ? 'GST invoice' : 'Cash bill'} />}
      </DialogTitle>
      <DialogContent dividers>
        {formQuery.isLoading && <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>}
        {formQuery.isError && <Alert severity="error">{getErrorMessage(formQuery.error, 'Could not open the invoice for editing')}</Alert>}
        {form && (
          <>
            <Alert severity="info" sx={{ mb: 2 }}>
              Change what the bill should say. Amounts, CGST / SGST and totals are worked out again as you type. After saving, the
              invoice PDF and the print show the edited bill.
            </Alert>

            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#1a237e', mb: 1 }}>Customer details (this invoice only)</Typography>
            <Grid container spacing={1.5} sx={{ mb: 2 }}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField {...small} required label="Customer name" value={name} onChange={(e) => setName(e.target.value)}
                  error={showErr(nameError)} helperText={showErr(nameError) ? nameError : undefined}
                  slotProps={{ htmlInput: { 'data-testid': 'edit-name', maxLength: 200 } }} />
              </Grid>
              <Grid size={{ xs: 12, sm: 3 }}>
                <TextField {...small} label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} slotProps={{ htmlInput: { 'data-testid': 'edit-phone', maxLength: 30 } }} />
              </Grid>
              <Grid size={{ xs: 12, sm: 3 }}>
                <TextField {...small} type="date" label="Invoice date" value={date} onChange={(e) => setDate(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'edit-date' } }} />
              </Grid>
              <Grid size={{ xs: 12, sm: 8 }}>
                <TextField {...small} multiline minRows={1} maxRows={3} label="Address" value={address} onChange={(e) => setAddress(e.target.value)}
                  slotProps={{ htmlInput: { 'data-testid': 'edit-address', maxLength: 500 } }} />
              </Grid>
              {withGst && (
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField {...small} label="Party GSTIN" value={gstin} onChange={(e) => setGstin(e.target.value)}
                    error={showErr(gstinError) || Boolean(gstinError)} helperText={gstinError || undefined}
                    slotProps={{ htmlInput: { 'data-testid': 'edit-gstin', maxLength: 20 } }} />
                </Grid>
              )}
            </Grid>

            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#1a237e', mb: 1 }}>Items</Typography>
            <TableContainer sx={{ border: '1px solid #dfe4f1', borderRadius: 1, mb: 1 }}>
              <Table size="small" sx={{ minWidth: withGst ? 1120 : 760 }} data-testid="edit-items">
                <TableHead>
                  <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: '#f3f5fc', px: 0.75, whiteSpace: 'nowrap' } }}>
                    <TableCell sx={{ width: 28 }}>#</TableCell>
                    <TableCell sx={{ minWidth: 220 }}>Particulars</TableCell>
                    {withGst && <TableCell sx={{ width: 90 }}>HSN / SAC</TableCell>}
                    <TableCell sx={{ width: 96 }}>Qty</TableCell>
                    <TableCell sx={{ width: 112 }}>Rate (₹)</TableCell>
                    <TableCell align="right" sx={{ width: 96 }}>Amount</TableCell>
                    {withGst && (
                      <>
                        <TableCell sx={{ width: 84 }}>CGST %</TableCell>
                        <TableCell align="right" sx={{ width: 80 }}>CGST ₹</TableCell>
                        <TableCell sx={{ width: 84 }}>SGST %</TableCell>
                        <TableCell align="right" sx={{ width: 80 }}>SGST ₹</TableCell>
                      </>
                    )}
                    <TableCell align="right" sx={{ width: 100 }}>Total</TableCell>
                    <TableCell sx={{ width: 40 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((r, i) => {
                    const err = rowErrors[i];
                    const ln = line(i);
                    return (
                      <TableRow key={r.key} data-testid={`edit-row-${i}`}>
                        <TableCell sx={cell}>{i + 1}</TableCell>
                        <TableCell sx={cell}>
                          <TextField size="small" fullWidth multiline minRows={1} maxRows={4} value={r.particulars}
                            onChange={(e) => update(r.key, { particulars: e.target.value })}
                            error={showErr(err.particulars)} helperText={showErr(err.particulars) ? err.particulars : undefined}
                            slotProps={{ htmlInput: { 'data-testid': `edit-particulars-${i}`, maxLength: 1000 } }} />
                        </TableCell>
                        {withGst && (
                          <TableCell sx={cell}>
                            <TextField size="small" fullWidth value={r.hsn_code} onChange={(e) => update(r.key, { hsn_code: e.target.value })}
                              slotProps={{ htmlInput: { 'data-testid': `edit-hsn-${i}`, maxLength: 30 } }} />
                          </TableCell>
                        )}
                        <TableCell sx={cell}>
                          <TextField size="small" type="number" fullWidth value={r.quantity} onChange={(e) => update(r.key, { quantity: e.target.value })}
                            error={showErr(err.quantity)} slotProps={{ htmlInput: { min: 1, step: 1, 'data-testid': `edit-qty-${i}` } }} />
                        </TableCell>
                        <TableCell sx={cell}>
                          <TextField size="small" type="number" fullWidth value={r.unit_price} onChange={(e) => update(r.key, { unit_price: e.target.value })}
                            error={showErr(err.unit_price)} slotProps={{ htmlInput: { min: 0, step: 'any', 'data-testid': `edit-rate-${i}` } }} />
                        </TableCell>
                        <TableCell align="right" sx={{ ...cell, pt: 1.4, whiteSpace: 'nowrap' }} data-testid={`edit-amount-${i}`}>{money(ln?.amount ?? amountOf(r))}</TableCell>
                        {withGst && (
                          <>
                            <TableCell sx={cell}>
                              <TextField size="small" type="number" fullWidth value={r.cgst_rate} onChange={(e) => update(r.key, { cgst_rate: e.target.value })}
                                error={showErr(err.cgst_rate)} slotProps={{ htmlInput: { min: 0, max: 50, step: 'any', 'data-testid': `edit-cgst-${i}` } }} />
                            </TableCell>
                            <TableCell align="right" sx={{ ...cell, pt: 1.4, whiteSpace: 'nowrap' }} data-testid={`edit-cgst-amt-${i}`}>{ln ? money(ln.cgst_amount) : '-'}</TableCell>
                            <TableCell sx={cell}>
                              <TextField size="small" type="number" fullWidth value={r.sgst_rate} onChange={(e) => update(r.key, { sgst_rate: e.target.value })}
                                error={showErr(err.sgst_rate)} slotProps={{ htmlInput: { min: 0, max: 50, step: 'any', 'data-testid': `edit-sgst-${i}` } }} />
                            </TableCell>
                            <TableCell align="right" sx={{ ...cell, pt: 1.4, whiteSpace: 'nowrap' }} data-testid={`edit-sgst-amt-${i}`}>{ln ? money(ln.sgst_amount) : '-'}</TableCell>
                          </>
                        )}
                        <TableCell align="right" sx={{ ...cell, pt: 1.4, fontWeight: 700, whiteSpace: 'nowrap' }} data-testid={`edit-total-${i}`}>{ln ? money(ln.total) : '-'}</TableCell>
                        <TableCell sx={cell}>
                          <Tooltip title={rows.length > 1 ? 'Remove this row' : 'An invoice needs at least one row'}>
                            <span>
                              <IconButton size="small" aria-label="Remove row" disabled={rows.length <= 1} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            <Button size="small" startIcon={<AddIcon />} onClick={addRow} data-testid="edit-add-row" sx={{ mb: 2 }}>Add a row</Button>

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField {...small} multiline minRows={2} label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} slotProps={{ htmlInput: { maxLength: 1000 } }} />
                {form.history.length > 0 && (
                  <Box sx={{ mt: 1.5 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>Earlier edits</Typography>
                    {form.history.slice(0, 4).map((h, i) => (
                      <Typography key={i} variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {h.edited_at ? new Date(h.edited_at + 'Z').toLocaleString('en-IN') : ''} · {h.edited_by ?? '-'} · {h.summary ?? 'edited'}
                      </Typography>
                    ))}
                  </Box>
                )}
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Box sx={{ border: '1px solid #dfe4f1', borderRadius: 2, p: 1.5, bgcolor: '#fafbff' }} data-testid="edit-totals">
                  {[
                    ['Total amount', preview?.subtotal],
                    ...(preview && preview.discount_amount > 0 ? [['Less: discount', -preview.discount_amount]] : []),
                    ...(withGst ? [['Tax (CGST + SGST)', preview?.tax_amount]] : []),
                    ['Calculated total', preview?.computed_total],
                  ].map(([label, value]) => (
                    <Box key={String(label)} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.25 }}>
                      <Typography color="text.secondary">{label}</Typography>
                      <Typography>{value == null ? '-' : money(Number(value))}</Typography>
                    </Box>
                  ))}
                  <Divider sx={{ my: 1 }} />
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TextField
                      size="small" type="number" label="Final amount (optional)" value={finalText}
                      onChange={(e) => setFinalText(e.target.value)} error={Boolean(finalError)}
                      helperText={finalError || 'Type to round off or agree a different total. Blank = the calculated total.'}
                      slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> }, htmlInput: { min: 0, step: 'any', 'data-testid': 'edit-final' } }}
                      sx={{ flex: 1 }}
                    />
                    <Tooltip title="Use the calculated total">
                      <span>
                        <IconButton aria-label="Reset final amount" disabled={finalText === ''} onClick={() => setFinalText('')} data-testid="edit-final-reset"><UndoIcon /></IconButton>
                      </span>
                    </Tooltip>
                  </Box>
                  {preview && Math.abs(preview.adjustment_amount) > 0.004 && (
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }} data-testid="edit-adjustment">
                      <Typography color="text.secondary">Round off / adjustment</Typography>
                      <Typography>{preview.adjustment_amount > 0 ? '+' : '-'} {money(Math.abs(preview.adjustment_amount))}</Typography>
                    </Box>
                  )}
                  <Box sx={{ mt: 1, py: 1, px: 1.5, borderRadius: 1.5, bgcolor: '#1a237e', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <Typography sx={{ fontWeight: 700 }}>Grand total</Typography>
                    <Typography sx={{ fontWeight: 800, fontSize: '1.6rem' }} data-testid="edit-grand-total">₹{preview ? money(preview.grand_total) : '-'}</Typography>
                  </Box>
                  {preview && preview.amount_paid > 0 && (
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: 0.75 }}>
                      <Typography color="text.secondary">Received so far ₹{money(preview.amount_paid)}</Typography>
                      <Typography sx={{ fontWeight: 700 }}>Balance ₹{money(preview.balance)}</Typography>
                    </Box>
                  )}
                </Box>
              </Grid>
            </Grid>

            {previewQuery.isError && <Alert severity="warning" sx={{ mt: 2 }}>{getErrorMessage(previewQuery.error, 'Could not re-work the amounts')}</Alert>}
            {saveMutation.isError && <Alert severity="error" sx={{ mt: 2 }} data-testid="edit-error">{getErrorMessage(saveMutation.error, 'Could not save the invoice')}</Alert>}
            {submitted && !valid && <Alert severity="error" sx={{ mt: 2 }}>Please fix the highlighted fields.</Alert>}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saveMutation.isPending}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={!form || saveMutation.isPending} data-testid="edit-save">
          {saveMutation.isPending ? 'Saving...' : 'Save changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
