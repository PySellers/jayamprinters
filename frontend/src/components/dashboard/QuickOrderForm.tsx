import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Alert, Autocomplete, Box, Button, Checkbox, Chip, CircularProgress, FormControlLabel, Grid,
  InputAdornment, Paper, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { customersApi } from '../../api/customersApi';
import { taxesApi } from '../../api/taxesApi';
import { productCategoriesApi } from '../../api/productsApi';
import { getErrorMessage } from '../../utils/api';
import type { Customer } from '../../types/customers';
import type { ProductCategory } from '../../types/products';

// ---- helpers -------------------------------------------------------------------

// Local (not UTC) date, so the form shows the right day in India early morning too.
function todayDateString(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const SHOP_OPEN_HOUR = 9;
const SHOP_CLOSE_HOUR = 20;

/**
 * Suggested time for the first proof: an hour from now, rounded up to the next
 * quarter hour, kept inside shop hours (before opening -> opening time;
 * after closing -> 10:00 the next morning). Staff can still change it.
 */
export function defaultProofSlot(now: Date = new Date()): { date: string; time: string } {
  const d = new Date(now.getTime() + 60 * 60 * 1000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  if (d.getHours() >= SHOP_CLOSE_HOUR) {
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
  } else if (d.getHours() < SHOP_OPEN_HOUR) {
    d.setHours(SHOP_OPEN_HOUR, 0, 0, 0);
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

function nowTimeString(): string {
  return new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

/** Digits only, without a leading +91 / 91 / 0 -> the 10-digit number (or whatever was typed). */
export function normalizePhone(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
}

const isValidPhone = (digits: string) => /^\d{10}$/.test(digits);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

type FieldKey =
  | 'billing' | 'phone' | 'whatsapp' | 'email' | 'gstin'
  | 'proof1Date' | 'proof1Time' | 'deliveryDate' | 'service';

// Top-to-bottom order, used to jump to the first problem.
const FIELD_ORDER: FieldKey[] = [
  'billing', 'phone', 'whatsapp', 'email', 'gstin', 'proof1Date', 'proof1Time', 'deliveryDate', 'service',
];
const FIELD_LABEL: Record<FieldKey, string> = {
  billing: 'Billing Person Name', phone: 'Phone Number', whatsapp: 'WhatsApp Number', email: 'Email',
  gstin: 'Customer GSTIN', proof1Date: 'Proof 1 Date', proof1Time: 'Proof 1 Time',
  deliveryDate: 'Delivery Date', service: 'Service',
};
const FIELD_ID: Record<FieldKey, string> = {
  billing: 'qo-billing', phone: 'qo-phone', whatsapp: 'qo-whatsapp', email: 'qo-email', gstin: 'qo-gstin',
  proof1Date: 'qo-proof1-date', proof1Time: 'qo-proof1-time', deliveryDate: 'qo-delivery-date', service: 'qo-service',
};

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.75 }}>
        <Box
          sx={{
            width: 26, height: 26, borderRadius: '50%', bgcolor: '#1a237e', color: '#fff',
            fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {n}
        </Box>
        <Typography sx={{ fontWeight: 800, color: '#1a237e', fontSize: '1.05rem' }}>{title}</Typography>
      </Box>
      {children}
    </Box>
  );
}

// Browser autofill is unhelpful on a counter screen shared by many customers.
const noAutofill = { autoComplete: 'off' } as const;
const dateProps = { slotProps: { inputLabel: { shrink: true } } } as const;

// ---- component -----------------------------------------------------------------

export default function QuickOrderForm() {
  const navigate = useNavigate();

  const defaultsQuery = useQuery({ queryKey: ['billing-defaults'], queryFn: customersApi.billingDefaults });
  const taxesQuery = useQuery({ queryKey: ['taxes'], queryFn: taxesApi.list });
  const categoriesQuery = useQuery({ queryKey: ['product-categories'], queryFn: productCategoriesApi.list });
  const services = useMemo(() => (categoriesQuery.data ?? []).filter((c) => c.is_active), [categoriesQuery.data]);
  const gstRate = (taxesQuery.data ?? []).find((t) => t.is_default && t.is_active)?.rate_percent ?? 18;

  const [orderTime, setOrderTime] = useState(nowTimeString());
  const [linked, setLinked] = useState<Customer | null>(null);
  const [billingName, setBillingName] = useState('');
  const [billingEdited, setBillingEdited] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [sameWhatsapp, setSameWhatsapp] = useState(false);
  const [email, setEmail] = useState('');
  const [gstin, setGstin] = useState('');
  const [address, setAddress] = useState('');
  const [withGst, setWithGst] = useState(false);
  const [proofSlot] = useState(() => defaultProofSlot());
  const [proof1Date, setProof1Date] = useState(proofSlot.date);
  const [proof1Time, setProof1Time] = useState(proofSlot.time);
  const [proof2Date, setProof2Date] = useState('');
  const [proof2Time, setProof2Time] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(proofSlot.date);
  const [deliveryTime, setDeliveryTime] = useState('');
  const [service, setService] = useState<ProductCategory | null>(null);

  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [lookupNotice, setLookupNotice] = useState('');

  // Keep the "Time" chip ticking so it always shows the current order time.
  useEffect(() => {
    const timer = setInterval(() => setOrderTime(nowTimeString()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Pre-fill the next walk-in placeholder ("Person 15") until staff type their own name.
  const nextPerson = defaultsQuery.data?.next_person_name ?? '';
  useEffect(() => {
    if (nextPerson && !billingEdited && !linked) setBillingName(nextPerson);
  }, [nextPerson, billingEdited, linked]);

  useEffect(() => {
    if (sameWhatsapp) setWhatsapp(phone);
  }, [sameWhatsapp, phone]);

  // ---- customer lookup for the billing-name dropdown ----
  const [debouncedBilling, setDebouncedBilling] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedBilling(billingName.trim()), 250);
    return () => clearTimeout(t);
  }, [billingName]);
  const searching = billingEdited && !linked && debouncedBilling.length >= 1;
  const searchQuery = useQuery({
    queryKey: ['customer-lookup', debouncedBilling],
    queryFn: () => customersApi.search(debouncedBilling),
    enabled: searching,
  });
  const nameOptions: Customer[] = searching ? searchQuery.data ?? [] : defaultsQuery.data?.recent_customers ?? [];

  function applyCustomer(c: Customer, onlyEmpty = false) {
    const fill = (current: string, incoming: string | null | undefined) =>
      onlyEmpty && current ? current : (incoming ?? '');
    setLinked(c);
    setBillingEdited(true);
    setBillingName(onlyEmpty && billingEdited && billingName ? billingName : c.billing_person_name || c.name);
    setCustomerName(fill(customerName, c.name && c.name !== (c.billing_person_name || '') ? c.name : ''));
    setPhone(fill(phone, c.phone));
    setWhatsapp(fill(whatsapp, c.whatsapp_number));
    setEmail(fill(email, c.email));
    setGstin(fill(gstin, c.gstin));
    setAddress(fill(address, c.address));
  }

  function clearLinked() {
    setLinked(null);
    setLookupNotice('');
    setBillingEdited(false);
    setCustomerName('');
    setPhone('');
    setWhatsapp('');
    setSameWhatsapp(false);
    setEmail('');
    setGstin('');
    setAddress('');
  }

  // Typing a phone number that already belongs to a customer loads their saved details.
  async function lookupByPhone() {
    setTouched((t) => ({ ...t, phone: true }));
    const digits = normalizePhone(phone);
    if (linked || !isValidPhone(digits)) return;
    try {
      const matches = await customersApi.search(digits);
      const exact = matches.find((m) => normalizePhone(m.phone ?? '') === digits);
      if (exact) {
        applyCustomer(exact, true);
        setLookupNotice('This phone number belongs to an existing customer — saved details were loaded.');
      }
    } catch {
      /* lookup is a convenience; ignore failures */
    }
  }

  // ---- validation ----
  const errors = useMemo(() => {
    const e: Partial<Record<FieldKey, string>> = {};
    if (!billingName.trim()) e.billing = 'Enter the billing person name';
    if (phone.trim() && !isValidPhone(normalizePhone(phone))) e.phone = 'Enter a 10-digit mobile number';
    if (whatsapp.trim() && !isValidPhone(normalizePhone(whatsapp))) e.whatsapp = 'Enter a 10-digit number';
    if (email.trim() && !EMAIL_RE.test(email.trim())) e.email = 'Enter a valid email, e.g. name@example.com';
    if (withGst && gstin.trim() && !GSTIN_RE.test(gstin.trim().toUpperCase())) {
      e.gstin = '15 characters, e.g. 33AAAAA0000A1Z5';
    }
    if (!proof1Date) e.proof1Date = 'Required';
    if (!proof1Time) e.proof1Time = 'Required — when the first design proof is due';
    if (!deliveryDate) e.deliveryDate = 'Required';
    else if (proof1Date && deliveryDate < proof1Date) e.deliveryDate = 'Cannot be before Proof 1';
    if (!service) e.service = 'Choose a service';
    return e;
  }, [billingName, phone, whatsapp, email, gstin, withGst, proof1Date, proof1Time, deliveryDate, service]);

  const touch = (k: FieldKey) => () => setTouched((t) => ({ ...t, [k]: true }));
  const showError = (k: FieldKey) => Boolean(errors[k]) && (submitted || Boolean(touched[k]));
  const helper = (k: FieldKey, fallback?: ReactNode): ReactNode => (showError(k) ? errors[k] : fallback);
  const errorKeys = FIELD_ORDER.filter((k) => errors[k]);

  // ---- submit ----
  const createOrderMutation = useMutation({
    mutationFn: async () => {
      const billing = billingName.trim();
      const digits = normalizePhone(phone);
      const wa = normalizePhone(whatsapp);
      const gst = withGst ? gstin.trim().toUpperCase() : '';

      let target = linked;
      if (!target && isValidPhone(digits)) {
        const matches = await customersApi.search(digits);
        target = matches.find((m) => normalizePhone(m.phone ?? '') === digits) ?? null;
      }

      if (target) {
        return customersApi.update(target.id, {
          ...(customerName.trim() ? { name: customerName.trim() } : {}),
          billing_person_name: billing,
          ...(digits ? { phone: digits } : {}),
          ...(wa ? { whatsapp_number: wa } : {}),
          ...(email.trim() ? { email: email.trim() } : {}),
          ...(gst ? { gstin: gst } : {}),
          ...(address.trim() ? { address: address.trim() } : {}),
        });
      }
      return customersApi.create({
        name: customerName.trim() || billing,
        billing_person_name: billing,
        phone: digits || null,
        whatsapp_number: wa || null,
        email: email.trim() || null,
        gstin: gst || null,
        address: address.trim() || null,
      });
    },
    onSuccess: (customer) => {
      const params = new URLSearchParams({
        quick: '1',
        customerId: String(customer.id),
        customerName: customer.name,
        categoryId: String(service!.id),
        withGst: withGst ? '1' : '0',
        proof1Date,
        proof1Time,
        proof2Date,
        proof2Time,
        deliveryDate,
        deliveryTime,
      });
      navigate(`/quotations/new?${params.toString()}`);
    },
  });

  function handleStart() {
    setSubmitted(true);
    const first = FIELD_ORDER.find((k) => errors[k]);
    if (first) {
      const el = document.getElementById(FIELD_ID[first]);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => el?.focus({ preventScroll: true }), 300);
      return;
    }
    createOrderMutation.mutate();
  }

  return (
    <Paper
      elevation={0}
      sx={{ p: { xs: 2.5, md: 3.5 }, borderRadius: 3, border: '1px solid #dfe4f1', bgcolor: '#fff', boxShadow: '0 4px 24px rgba(26,35,126,0.06)' }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, color: '#1a237e', lineHeight: 1.15 }}>
            Start New Order
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Fields marked * are required
          </Typography>
        </Box>
        <Chip label={`${todayDateString()}  ·  ${orderTime}`} variant="outlined" sx={{ fontWeight: 600 }} />
      </Box>

      {createOrderMutation.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {getErrorMessage(createOrderMutation.error, 'Could not start the order. Please try again.')}
        </Alert>
      )}

      {/* 1 ── Customer ─────────────────────────────────────────────── */}
      <Section n={1} title="Customer">
        {linked && (
          <Alert
            severity="success"
            sx={{ mb: 2 }}
            action={<Button color="inherit" size="small" onClick={clearLinked}>New customer</Button>}
          >
            {lookupNotice || 'Existing customer selected — saved details were loaded.'} Editing a field updates their record.
          </Alert>
        )}
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Autocomplete
              id={FIELD_ID.billing}
              freeSolo
              openOnFocus
              options={nameOptions}
              filterOptions={(o) => o}
              inputValue={billingName}
              onInputChange={(_, value, reason) => {
                if (reason === 'input' || reason === 'clear') {
                  setBillingName(value);
                  setBillingEdited(true);
                }
              }}
              onChange={(_, value) => {
                if (value && typeof value !== 'string') applyCustomer(value);
              }}
              getOptionLabel={(o) => (typeof o === 'string' ? o : o.billing_person_name || o.name)}
              renderOption={(props, o) => {
                const { key, ...rest } = props as typeof props & { key: string };
                return (
                  <li key={key} {...rest}>
                    <Box>
                      <Typography sx={{ fontWeight: 600 }}>{o.billing_person_name || o.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {[o.name !== o.billing_person_name ? o.name : '', o.phone].filter(Boolean).join(' · ') || 'No phone saved'}
                      </Typography>
                    </Box>
                  </li>
                );
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Billing Person Name"
                  required
                  onBlur={touch('billing')}
                  error={showError('billing')}
                  helperText={helper(
                    'billing',
                    billingEdited ? 'Pick a saved customer or keep typing a new name' : 'Auto-numbered for walk-ins — click to pick a saved customer, or type a name',
                  )}
                  slotProps={{ ...params.slotProps, htmlInput: { ...params.slotProps.htmlInput, ...noAutofill, name: 'qo-billing-person' } }}
                />
              )}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Customer / Company Name"
              fullWidth
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              helperText="Optional — printed on the bill. Leave blank to use the billing person."
              slotProps={{ htmlInput: { ...noAutofill, name: 'qo-company' } }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              id={FIELD_ID.phone}
              label="Phone Number"
              fullWidth
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={lookupByPhone}
              error={showError('phone')}
              helperText={helper('phone', 'Returning customers are found by phone')}
              slotProps={{
                input: { startAdornment: <InputAdornment position="start">+91</InputAdornment> },
                htmlInput: { ...noAutofill, name: 'qo-phone', inputMode: 'numeric', maxLength: 16 },
              }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              id={FIELD_ID.whatsapp}
              label="WhatsApp Number"
              fullWidth
              value={whatsapp}
              disabled={sameWhatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              onBlur={touch('whatsapp')}
              error={showError('whatsapp')}
              helperText={
                helper('whatsapp') ?? (
                  <FormControlLabel
                    sx={{ m: 0 }}
                    control={<Checkbox size="small" checked={sameWhatsapp} onChange={(e) => setSameWhatsapp(e.target.checked)} />}
                    label={<Typography variant="caption">Same as phone</Typography>}
                  />
                )
              }
              slotProps={{
                input: { startAdornment: <InputAdornment position="start">+91</InputAdornment> },
                htmlInput: { ...noAutofill, name: 'qo-whatsapp', inputMode: 'numeric', maxLength: 16 },
              }}
            />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <TextField
              id={FIELD_ID.email}
              label="Email"
              type="email"
              fullWidth
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={touch('email')}
              error={showError('email')}
              helperText={helper('email')}
              slotProps={{ htmlInput: { ...noAutofill, name: 'qo-email' } }}
            />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <TextField
              label="Address"
              fullWidth
              multiline
              minRows={2}
              maxRows={5}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              slotProps={{ htmlInput: { ...noAutofill, name: 'qo-address' } }}
            />
          </Grid>
        </Grid>
      </Section>

      {/* 2 ── Bill type ─────────────────────────────────────────────── */}
      <Section n={2} title="Bill type">
        <ToggleButtonGroup
          exclusive
          fullWidth
          color="primary"
          value={withGst ? 'gst' : 'cash'}
          onChange={(_, value: 'gst' | 'cash' | null) => value && setWithGst(value === 'gst')}
        >
          <ToggleButton value="gst" sx={{ fontWeight: 700, py: 1.25 }}>With GST</ToggleButton>
          <ToggleButton value="cash" sx={{ fontWeight: 700, py: 1.25 }}>Without GST</ToggleButton>
        </ToggleButtonGroup>
        <Alert severity="info" icon={false} sx={{ mt: 1.5, bgcolor: '#f3f6ff' }}>
          {withGst ? (
            <>
              <strong>Tax Invoice (A4).</strong> {gstRate}% GST is added to the total and shown as CGST {gstRate / 2}% + SGST {gstRate / 2}%.
              The shop's GSTIN is printed. Add the customer's GSTIN below if they are a registered business.
            </>
          ) : (
            <>
              <strong>Cash Bill (A5).</strong> No tax is added — the total is just the item prices.
            </>
          )}
        </Alert>
        {withGst && (
          <TextField
            id={FIELD_ID.gstin}
            label="Customer GSTIN"
            fullWidth
            sx={{ mt: 2 }}
            value={gstin}
            onChange={(e) => setGstin(e.target.value.toUpperCase())}
            onBlur={touch('gstin')}
            error={showError('gstin')}
            helperText={helper('gstin', 'Optional — printed as "Party GSTIN". Leave blank for walk-in customers.')}
            slotProps={{ htmlInput: { ...noAutofill, name: 'qo-gstin', maxLength: 15 } }}
          />
        )}
      </Section>

      {/* 3 ── Schedule ──────────────────────────────────────────────── */}
      <Section n={3} title="Proof & delivery">
        <Grid container spacing={2}>
          <Grid size={{ xs: 6 }}>
            <TextField
              id={FIELD_ID.proof1Date}
              label="Proof 1 Date"
              type="date"
              required
              fullWidth
              value={proof1Date}
              onChange={(e) => setProof1Date(e.target.value)}
              onBlur={touch('proof1Date')}
              error={showError('proof1Date')}
              helperText={helper('proof1Date')}
              {...dateProps}
            />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <TextField
              id={FIELD_ID.proof1Time}
              label="Proof 1 Time"
              type="time"
              required
              fullWidth
              value={proof1Time}
              onChange={(e) => setProof1Time(e.target.value)}
              onBlur={touch('proof1Time')}
              error={showError('proof1Time')}
              helperText={helper('proof1Time', 'First design proof for the customer — suggested slot, change if needed')}
              {...dateProps}
            />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <TextField label="Proof 2 Date" type="date" fullWidth value={proof2Date} onChange={(e) => setProof2Date(e.target.value)} helperText="Optional" {...dateProps} />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <TextField label="Proof 2 Time" type="time" fullWidth value={proof2Time} onChange={(e) => setProof2Time(e.target.value)} helperText="Optional" {...dateProps} />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <TextField
              id={FIELD_ID.deliveryDate}
              label="Delivery Date"
              type="date"
              required
              fullWidth
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              onBlur={touch('deliveryDate')}
              error={showError('deliveryDate')}
              helperText={helper('deliveryDate')}
              {...dateProps}
            />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <TextField label="Delivery Time" type="time" fullWidth value={deliveryTime} onChange={(e) => setDeliveryTime(e.target.value)} helperText="Optional" {...dateProps} />
          </Grid>
        </Grid>
      </Section>

      {/* 4 ── Service ───────────────────────────────────────────────── */}
      <Section n={4} title="Service">
        <Autocomplete
          id={FIELD_ID.service}
          options={services}
          value={service}
          onChange={(_, v) => {
            setService(v);
            setTouched((t) => ({ ...t, service: true }));
          }}
          getOptionLabel={(c) => c.name}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          loading={categoriesQuery.isLoading}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Service"
              required
              error={showError('service')}
              helperText={helper('service', 'Next you will choose the exact item and options')}
              slotProps={{ ...params.slotProps, htmlInput: { ...params.slotProps.htmlInput, ...noAutofill, name: 'qo-service' } }}
            />
          )}
        />
      </Section>

      {submitted && errorKeys.length > 0 && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Please complete {errorKeys.length === 1 ? 'this field' : `these ${errorKeys.length} fields`} (highlighted in red):{' '}
          <strong>{errorKeys.map((k) => FIELD_LABEL[k]).join(', ')}</strong>
        </Alert>
      )}

      <Button
        variant="contained"
        fullWidth
        size="large"
        sx={{ bgcolor: '#1a237e', py: 1.6, fontSize: '1.1rem', fontWeight: 700, borderRadius: 2, '&:hover': { bgcolor: '#0d145e' } }}
        disabled={createOrderMutation.isPending}
        onClick={handleStart}
        startIcon={createOrderMutation.isPending ? <CircularProgress size={20} color="inherit" /> : undefined}
      >
        {createOrderMutation.isPending ? 'Starting…' : 'Start Order'}
      </Button>
    </Paper>
  );
}
