import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, useFieldArray, useWatch, FormProvider } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import {
  Box, AppBar, Toolbar, Typography, Button, IconButton, TextField, Grid,
  Alert, MenuItem, Divider, Paper,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LogoutIcon from '@mui/icons-material/Logout';
import AddIcon from '@mui/icons-material/Add';
import PrintIcon from '@mui/icons-material/Print';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { useAuth } from '../context/AuthContext';
import { customersApi } from '../api/customersApi';
import { quotationsApi } from '../api/quotationsApi';
import { invoicesApi, type InvoicePrintFormat } from '../api/invoicesApi';
import { getErrorMessage } from '../utils/api';
import type { QuotationCreateInput, QuotationItemInput, QuotationPreview } from '../types/quotations';
import QuotationLineItem from '../components/quotations/QuotationLineItem';

const emptyItem: QuotationItemInput = {
  product_id: 0,
  quantity: 1,
  selected_options: [],
  extra_charge_ids: [],
};

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

const CASH_DENOMINATIONS = [50, 100, 500, 1000, 2000];

export default function BillingCounter() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerGstin, setCustomerGstin] = useState('');
  const [tendered, setTendered] = useState('');
  const [printFormat, setPrintFormat] = useState<InvoicePrintFormat>('thermal_80');
  const [lastSaved, setLastSaved] = useState<{ invoiceNumber: string; total: number } | null>(null);
  const [clock, setClock] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const methods = useForm<QuotationCreateInput>({
    defaultValues: { customer_id: 0, tax_id: null, notes: '', items: [emptyItem] },
  });
  const { control, handleSubmit, reset } = methods;
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const watchedItems = useWatch({ control, name: 'items' });
  const watchedTaxId = useWatch({ control, name: 'tax_id' });

  const [preview, setPreview] = useState<QuotationPreview | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const priceableItems = (watchedItems ?? []).filter((it) => it && it.product_id);
    if (priceableItems.length === 0) {
      setPreview(null);
      return;
    }
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => {
      quotationsApi
        .preview({ tax_id: watchedTaxId, items: priceableItems })
        .then(setPreview)
        .catch(() => setPreview(null));
    }, 300);
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(watchedItems), watchedTaxId]);

  const grandTotal = preview?.grand_total ?? 0;
  const changeDue = useMemo(() => {
    const t = parseFloat(tendered);
    return Number.isFinite(t) ? t - grandTotal : null;
  }, [tendered, grandTotal]);

  const saveMutation = useMutation({
    mutationFn: async (data: QuotationCreateInput) => {
      const customer = await customersApi.create({
        name: customerName.trim() || 'Walk-in Customer',
        phone: customerPhone.trim() || null,
        gstin: customerGstin.trim() || null,
      });
      const quotation = await quotationsApi.create({ ...data, customer_id: customer.id });
      await quotationsApi.convert(quotation.id);
      const invoice = await invoicesApi.createFromQuotation(quotation.id);
      return invoice;
    },
    onSuccess: async (invoice) => {
      await invoicesApi.printPdf(invoice.id, printFormat);
      setLastSaved({ invoiceNumber: invoice.invoice_number, total: invoice.grand_total });
      startNewBill();
    },
  });

  function startNewBill() {
    setCustomerName('');
    setCustomerPhone('');
    setCustomerGstin('');
    setTendered('');
    setPreview(null);
    reset({ customer_id: 0, tax_id: null, notes: '', items: [emptyItem] });
  }

  const onSubmit = (data: QuotationCreateInput) => {
    saveMutation.mutate({
      ...data,
      items: data.items.map((item) => ({ ...item, product_id: Number(item.product_id) })),
    });
  };

  // F8 = save & print (matches the muscle-memory of the legacy till software
  // this screen is modeled on); Escape = start a fresh bill.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'F8') {
        e.preventDefault();
        handleSubmit(onSubmit)();
      } else if (e.key === 'Escape') {
        startNewBill();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleSubmit]);

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#eef1f7' }}>
      <AppBar position="static" sx={{ bgcolor: '#1a237e' }}>
        <Toolbar sx={{ gap: 2 }}>
          <IconButton color="inherit" onClick={() => navigate('/dashboard')}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
            Sri Jayam Printers — Billing Counter
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Typography variant="body2" sx={{ opacity: 0.85 }}>
            {clock.toLocaleDateString()} {clock.toLocaleTimeString()}
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.85 }}>
            {user?.name}
          </Typography>
          <IconButton color="inherit" onClick={logout} title="Logout">
            <LogoutIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      {lastSaved && (
        <Alert severity="success" onClose={() => setLastSaved(null)} sx={{ borderRadius: 0 }}>
          Saved as {lastSaved.invoiceNumber} — ₹{lastSaved.total.toFixed(2)}. Sent to print. Ready for the next bill.
        </Alert>
      )}
      {saveMutation.isError && (
        <Alert severity="error" sx={{ borderRadius: 0 }}>
          {getErrorMessage(saveMutation.error, 'Could not save this bill')}
        </Alert>
      )}

      {/* Customer strip */}
      <Paper square sx={{ p: 1.5 }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              label="Customer Name"
              fullWidth
              size="small"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Walk-in Customer"
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <TextField
              label="Mobile No."
              fullWidth
              size="small"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <TextField
              label="GSTIN (optional)"
              fullWidth
              size="small"
              value={customerGstin}
              onChange={(e) => setCustomerGstin(e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 2 }}>
            <TextField label="Date" fullWidth size="small" value={todayDateString()} disabled />
          </Grid>
        </Grid>
      </Paper>

      {/* Line items -- the full body of the screen, like a counter till */}
      <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 2 }}>
        <FormProvider {...methods}>
          {fields.map((field, index) => (
            <QuotationLineItem
              key={field.id}
              index={index}
              onRemove={() => remove(index)}
              canRemove={fields.length > 1}
              previewItem={preview?.items[index]}
            />
          ))}
        </FormProvider>
        <Button startIcon={<AddIcon />} onClick={() => append(emptyItem)}>
          Add Item (F1)
        </Button>
      </Box>

      {/* Bottom till bar */}
      <Paper square elevation={6} sx={{ p: 2, bgcolor: '#1a237e', color: 'white' }}>
        <Grid container spacing={2} sx={{ alignItems: 'center' }}>
          <Grid size={{ xs: 12, sm: 3 }}>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {CASH_DENOMINATIONS.map((amt) => (
                <Button
                  key={amt}
                  size="small"
                  variant="outlined"
                  color="inherit"
                  onClick={() => setTendered((prev) => String((parseFloat(prev) || 0) + amt))}
                >
                  ₹{amt}
                </Button>
              ))}
            </Box>
          </Grid>
          <Grid size={{ xs: 6, sm: 2 }}>
            <TextField
              label="Cash Tendered"
              type="number"
              size="small"
              fullWidth
              value={tendered}
              onChange={(e) => setTendered(e.target.value)}
              sx={{ bgcolor: 'white', borderRadius: 1 }}
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 2 }}>
            <Typography variant="caption" sx={{ opacity: 0.8 }}>
              Change Due
            </Typography>
            <Typography variant="h6">
              {changeDue !== null && changeDue >= 0 ? `₹${changeDue.toFixed(2)}` : '—'}
            </Typography>
          </Grid>
          <Grid size={{ xs: 6, sm: 2 }}>
            <Typography variant="caption" sx={{ opacity: 0.8 }}>
              Net Amount
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
              ₹{grandTotal.toFixed(2)}
            </Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 3 }}>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField
                select
                size="small"
                value={printFormat}
                onChange={(e) => setPrintFormat(e.target.value as InvoicePrintFormat)}
                sx={{ bgcolor: 'white', borderRadius: 1, minWidth: 120 }}
              >
                <MenuItem value="thermal_80">Thermal 80mm</MenuItem>
                <MenuItem value="thermal_58">Thermal 58mm</MenuItem>
                <MenuItem value="a4">A4</MenuItem>
              </TextField>
              <Button
                variant="outlined"
                color="inherit"
                startIcon={<RestartAltIcon />}
                onClick={startNewBill}
                title="Esc"
              >
                New
              </Button>
              <Button
                variant="contained"
                color="warning"
                startIcon={<PrintIcon />}
                disabled={saveMutation.isPending || !preview || preview.items.some((i) => !i.priceable)}
                onClick={handleSubmit(onSubmit)}
                title="F8"
              >
                {saveMutation.isPending ? 'Saving…' : 'Save & Print'}
              </Button>
            </Box>
          </Grid>
        </Grid>
        <Divider sx={{ my: 1, borderColor: 'rgba(255,255,255,0.2)' }} />
        <Typography variant="caption" sx={{ opacity: 0.7 }}>
          F1 Add Item · F8 Save &amp; Print · Esc New Bill
        </Typography>
      </Paper>
    </Box>
  );
}
