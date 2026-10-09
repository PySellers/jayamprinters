import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Box, Typography, Paper, TextField, Button, Grid, Alert, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { customersApi } from '../../api/customersApi';
import { getErrorMessage } from '../../utils/api';
import { productCategoriesApi } from '../../api/productsApi';
import EntitySelect from '../pickers/EntitySelect';

// Local (not UTC) date, so the form shows the right day in India early morning too.
function todayDateString(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function nowTimeString(): string {
  return new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export default function QuickOrderForm() {
  const navigate = useNavigate();

  const customersQuery = useQuery({ queryKey: ['customers'], queryFn: customersApi.list });

  const [billingName, setBillingName] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [orderTime, setOrderTime] = useState(nowTimeString());
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [gstin, setGstin] = useState('');
  const [address, setAddress] = useState('');
  // Chosen per order: a GST invoice or a plain cash bill (no tax).
  const [withGst, setWithGst] = useState(false);
  const [proof1Date, setProof1Date] = useState(todayDateString());
  const [proof1Time, setProof1Time] = useState('');
  const [proof2Date, setProof2Date] = useState('');
  const [proof2Time, setProof2Time] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(todayDateString());
  const [deliveryTime, setDeliveryTime] = useState('');
  // One entry per service (not per product); the next screen lets staff pick the exact item.
  const [categoryId, setCategoryId] = useState<number | null>(null);

  // REMOVED: The useEffect that auto-filled "Person X" for billingName

  // Keep the "Time" box ticking so it always shows the current order time.
  useEffect(() => {
    const timer = setInterval(() => setOrderTime(nowTimeString()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const createOrderMutation = useMutation({
    mutationFn: async () => {
      const billing = billingName.trim() || `Person ${(customersQuery.data?.length ?? 0) + 1}`;
      const phoneValue = phone.trim();

      if (phoneValue) {
        const matches = await customersApi.search(phoneValue);
        const existing = matches.find((c) => (c.phone ?? '').trim() === phoneValue);
        if (existing) {
          return customersApi.update(existing.id, {
            ...(customerName.trim() ? { name: customerName.trim() } : {}),
            billing_person_name: billing,
            ...(whatsapp.trim() ? { whatsapp_number: whatsapp.trim() } : {}),
            ...(email.trim() ? { email: email.trim() } : {}),
            ...(gstin.trim() ? { gstin: gstin.trim() } : {}),
            ...(address.trim() ? { address: address.trim() } : {}),
          });
        }
      }

      return customersApi.create({
        name: customerName.trim() || billing,
        billing_person_name: billing,
        phone: phoneValue || null,
        whatsapp_number: whatsapp.trim() || null,
        email: email.trim() || null,
        gstin: gstin.trim() || null,
        address: address.trim() || null,
      });
    },
    onSuccess: (customer) => {
      const params = new URLSearchParams({
        quick: '1',
        customerId: String(customer.id),
        customerName: customer.name,
        categoryId: String(categoryId),
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

  const canSubmit =
    Boolean(categoryId) && Boolean(deliveryDate) && Boolean(proof1Date) && Boolean(proof1Time);

  return (
    <Paper sx={{ p: 3, borderRadius: 3, border: '2px solid #1a237e', height: '100%' }}>
      <Typography variant="h4" sx={{ fontWeight: 800, mb: 2, color: '#1a237e' }}>
        Start New Order
      </Typography>

      {createOrderMutation.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {getErrorMessage(createOrderMutation.error, 'Could not start the order. Please try again.')}
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid size={{ xs: 6 }}>
          <TextField label="Date" value={todayDateString()} fullWidth size="small" disabled />
        </Grid>
        <Grid size={{ xs: 6 }}>
          <TextField label="Time" value={orderTime} fullWidth size="small" disabled />
        </Grid>

        <Grid size={{ xs: 12 }}>
          <TextField
            label="Billing Person Name"
            placeholder="Enter billing person name"
            fullWidth
            size="small"
            value={billingName}
            onChange={(e) => setBillingName(e.target.value)}
            // REMOVED: helperText="Defaults to Person N — change any time"
          />
        </Grid>
        <Grid size={{ xs: 12 }}>
          <TextField
            label="Customer Name"
            fullWidth
            size="small"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
          />
        </Grid>
        <Grid size={{ xs: 12 }}>
          <TextField
            label="Phone Number"
            fullWidth
            size="small"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Grid>
        <Grid size={{ xs: 12 }}>
          <TextField
            label="WhatsApp Number (optional)"
            fullWidth
            size="small"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
          />
        </Grid>
        <Grid size={{ xs: 6 }}>
          <TextField label="Email" fullWidth size="small" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Grid>
        <Grid size={{ xs: 6 }}>
          <TextField label="GSTIN" fullWidth size="small" value={gstin} onChange={(e) => setGstin(e.target.value)} />
        </Grid>
        
        {/* UPDATED: Address field now supports multiple lines and auto-expands */}
        <Grid size={{ xs: 12 }}>
          <TextField 
            label="Address" 
            placeholder="Enter full address"
            fullWidth 
            multiline
            rows={3}
            maxRows={5}
            value={address} 
            onChange={(e) => setAddress(e.target.value)} 
          />
        </Grid>

        <Grid size={{ xs: 12 }}>
          <ToggleButtonGroup
            exclusive
            fullWidth
            size="small"
            color="primary"
            value={withGst ? 'gst' : 'cash'}
            onChange={(_, value: 'gst' | 'cash' | null) => value && setWithGst(value === 'gst')}
          >
            <ToggleButton value="gst" sx={{ fontWeight: 700 }}>With GST</ToggleButton>
            <ToggleButton value="cash" sx={{ fontWeight: 700 }}>Without GST</ToggleButton>
          </ToggleButtonGroup>
        </Grid>

        <Grid size={{ xs: 6 }}>
          <TextField
            label="Proof 1 Date"
            type="date"
            required
            fullWidth
            size="small"
            value={proof1Date}
            onChange={(e) => setProof1Date(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Grid>
        <Grid size={{ xs: 6 }}>
          <TextField
            label="Proof 1 Time"
            type="time"
            required
            fullWidth
            size="small"
            value={proof1Time}
            onChange={(e) => setProof1Time(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Grid>
        <Grid size={{ xs: 6 }}>
          <TextField
            label="Proof 2 Date (optional)"
            type="date"
            fullWidth
            size="small"
            value={proof2Date}
            onChange={(e) => setProof2Date(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Grid>
        <Grid size={{ xs: 6 }}>
          <TextField
            label="Proof 2 Time (optional)"
            type="time"
            fullWidth
            size="small"
            value={proof2Time}
            onChange={(e) => setProof2Time(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Grid>

        <Grid size={{ xs: 6 }}>
          <TextField
            label="Delivery Date"
            type="date"
            required
            fullWidth
            size="small"
            value={deliveryDate}
            onChange={(e) => setDeliveryDate(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Grid>
        <Grid size={{ xs: 6 }}>
          <TextField
            label="Delivery Time"
            type="time"
            fullWidth
            size="small"
            value={deliveryTime}
            onChange={(e) => setDeliveryTime(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Grid>

        <Grid size={{ xs: 12 }}>
          <EntitySelect
            label="Service"
            required
            mode="list"
            queryKey="quick-order-service-picker"
            fetchOptions={async () => (await productCategoriesApi.list()).filter((c) => c.is_active)}
            getOptionLabel={(c) => c.name}
            value={categoryId}
            onChange={setCategoryId}
          />
        </Grid>

        <Grid size={{ xs: 12 }}>
          <Button
            variant="contained"
            fullWidth
            size="large"
            sx={{ bgcolor: '#1a237e', py: 1.5, fontSize: '1.1rem', fontWeight: 700, '&:hover': { bgcolor: '#0d145e' } }}
            disabled={!canSubmit || createOrderMutation.isPending}
            onClick={() => createOrderMutation.mutate()}
          >
            Start Order
          </Button>
        </Grid>
      </Grid>

      <Box sx={{ mt: 2 }}>
        <Typography variant="caption" color="text.secondary">
          Next: choose the exact item and options for the service, then the price and invoice are generated automatically.
        </Typography>
      </Box>
    </Paper>
  );
}