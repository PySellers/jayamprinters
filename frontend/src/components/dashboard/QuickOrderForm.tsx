import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Box, Typography, Paper, TextField, Button, Grid, Alert } from '@mui/material';
import { customersApi } from '../../api/customersApi';
import { productsApi, productCategoriesApi } from '../../api/productsApi';
import EntitySelect from '../pickers/EntitySelect';
import type { Product } from '../../types/products';

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function QuickOrderForm() {
  const navigate = useNavigate();

  const customersQuery = useQuery({ queryKey: ['customers'], queryFn: customersApi.list });
  const categoriesQuery = useQuery({ queryKey: ['product-categories'], queryFn: productCategoriesApi.list });

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gstin, setGstin] = useState('');
  const [address, setAddress] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(todayDateString());
  const [deliveryTime, setDeliveryTime] = useState('');
  const [productId, setProductId] = useState<number | null>(null);

  useEffect(() => {
    if (!name && customersQuery.data) {
      setName(`Person ${customersQuery.data.length + 1}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customersQuery.data]);

  const categoryName = (categoryId?: number | null) =>
    categoriesQuery.data?.find((c) => c.id === categoryId)?.name ?? '';

  const productLabel = (p: Product) => {
    const cat = categoryName(p.category_id);
    return cat ? `${cat} — ${p.name}` : p.name;
  };

  const createOrderMutation = useMutation({
    mutationFn: async () => {
      const customer = await customersApi.create({
        name: name.trim() || `Person ${(customersQuery.data?.length ?? 0) + 1}`,
        phone: phone.trim() || null,
        email: email.trim() || null,
        gstin: gstin.trim() || null,
        address: address.trim() || null,
      });
      return customer;
    },
    onSuccess: (customer) => {
      const params = new URLSearchParams({
        quick: '1',
        customerId: String(customer.id),
        customerName: customer.name,
        productId: String(productId),
        deliveryDate,
        deliveryTime,
      });
      navigate(`/quotations/new?${params.toString()}`);
    },
  });

  const canSubmit = Boolean(productId) && Boolean(deliveryDate);

  return (
    <Paper sx={{ p: 3, borderRadius: 2, border: '2px solid #1a237e' }}>
      <Typography variant="h4" sx={{ fontWeight: 800, mb: 2, color: '#1a237e' }}>
        Start New Order
      </Typography>

      {createOrderMutation.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Could not start the order. Please try again.
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid size={{ xs: 6 }}>
          <TextField label="Date" value={todayDateString()} fullWidth size="small" disabled />
        </Grid>
        <Grid size={{ xs: 6 }}>
          <TextField label="Order #" value="Assigned automatically on save" fullWidth size="small" disabled />
        </Grid>

        <Grid size={{ xs: 12 }}>
          <TextField
            label="Name"
            fullWidth
            size="small"
            value={name}
            onChange={(e) => setName(e.target.value)}
            helperText="Defaults to Person N — change any time"
          />
        </Grid>
        <Grid size={{ xs: 6 }}>
          <TextField label="Mobile No." fullWidth size="small" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Grid>
        <Grid size={{ xs: 6 }}>
          <TextField label="Email" fullWidth size="small" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Grid>
        <Grid size={{ xs: 6 }}>
          <TextField label="GSTIN" fullWidth size="small" value={gstin} onChange={(e) => setGstin(e.target.value)} />
        </Grid>
        <Grid size={{ xs: 6 }}>
          <TextField label="Address" fullWidth size="small" value={address} onChange={(e) => setAddress(e.target.value)} />
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
            queryKey="quick-order-product-picker"
            fetchOptions={productsApi.list}
            getOptionLabel={productLabel}
            value={productId}
            onChange={setProductId}
          />
        </Grid>

        <Grid size={{ xs: 12 }}>
          <Button
            variant="contained"
            fullWidth
            size="large"
            sx={{ bgcolor: '#1a237e', py: 1.5, fontSize: '1.1rem', fontWeight: 700 }}
            disabled={!canSubmit || createOrderMutation.isPending}
            onClick={() => createOrderMutation.mutate()}
          >
            Start Order
          </Button>
        </Grid>
      </Grid>

      <Box sx={{ mt: 1 }}>
        <Typography variant="caption" color="text.secondary">
          Next: fill in size/paper/quantity for the chosen service, then the price and invoice are generated automatically.
        </Typography>
      </Box>
    </Paper>
  );
}
