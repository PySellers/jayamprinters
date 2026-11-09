import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Box, Typography, Paper, Tabs, Tab, Alert, TextField, Button, InputAdornment, CircularProgress } from '@mui/material';
import { productCategoriesApi } from '../api/productsApi';
import AttributesPanel from '../components/pricingSetup/AttributesPanel';
import QuantitySlabsPanel from '../components/pricingSetup/QuantitySlabsPanel';
import ExtraChargesPanel from '../components/pricingSetup/ExtraChargesPanel';
import PrintingTaxPanel from '../components/pricingSetup/PrintingTaxPanel';

export default function PricingSetup() {
  // A link from the order screen opens straight on the service and tab that holds a rate:
  // /pricing-setup?category=9&tab=printing  (attributes | slabs | charges | printing)
  const [searchParams] = useSearchParams();
  const TABS = ['attributes', 'slabs', 'charges', 'printing'];
  const [categoryId, setCategoryId] = useState<number | null>(searchParams.get('category') ? Number(searchParams.get('category')) : null);
  const [tab, setTab] = useState(Math.max(0, TABS.indexOf(searchParams.get('tab') ?? '')));

  // Minimum amount billed for one line of this service (small runs cost more per unit).
  const queryClient = useQueryClient();
  const categoriesQuery = useQuery({ queryKey: ['product-categories'], queryFn: productCategoriesApi.list });
  const category = categoriesQuery.data?.find((c) => c.id === categoryId);
  const [serviceFilter, setServiceFilter] = useState('');
  const services = (categoriesQuery.data ?? []).filter((c) => c.name.toLowerCase().includes(serviceFilter.trim().toLowerCase()));
  const [minCharge, setMinCharge] = useState('');
  useEffect(() => {
    setMinCharge(category?.min_charge != null ? String(category.min_charge) : '');
  }, [category?.id, category?.min_charge]);
  const saveMinCharge = useMutation({
    mutationFn: () =>
      productCategoriesApi.update(categoryId!, { min_charge: minCharge.trim() === '' ? null : Math.max(0, Number(minCharge) || 0) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-categories'] });
      queryClient.invalidateQueries({ queryKey: ['product-category-picker'] });
    },
  });
  const minChargeUnchanged = (category?.min_charge != null ? String(category.min_charge) : '') === minCharge.trim();

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 3 }}>
        Pricing Setup
      </Typography>

      <Paper sx={{ p: 3, borderRadius: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <Box sx={{ flex: '1 1 480px', minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1, flexWrap: 'wrap' }}>
              <Typography sx={{ fontWeight: 700 }}>Service</Typography>
              <TextField
                size="small" placeholder="Search a service..." value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} sx={{ width: 240 }}
                slotProps={{ htmlInput: { 'aria-label': 'Search a service', 'data-testid': 'ps-service-search' } }}
              />
            </Box>
            <Box
              data-testid="ps-service-tiles"
              sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)' }, gap: 0.75 }}
            >
              {categoriesQuery.isLoading && <CircularProgress size={20} />}
              {services.map((c) => {
                const on = categoryId === c.id;
                return (
                  <Button
                    key={c.id}
                    data-testid="ps-service-tile"
                    aria-pressed={on}
                    onClick={() => setCategoryId(c.id)}
                    variant={on ? 'contained' : 'outlined'}
                    sx={{
                      textTransform: 'none', fontWeight: 700, fontSize: 13, lineHeight: 1.2, py: 0.75, px: 1, minHeight: 40, justifyContent: 'center', textAlign: 'center',
                      ...(on ? { bgcolor: '#1a237e', '&:hover': { bgcolor: '#0d145e' } } : { borderColor: '#c5cae9', color: '#1a237e' }),
                    }}
                  >
                    {c.name}{c.is_active === false ? ' (off)' : ''}
                  </Button>
                );
              })}
              {!categoriesQuery.isLoading && services.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ gridColumn: '1 / -1' }}>No service matches.</Typography>
              )}
            </Box>
            {category && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                Setting up: <strong>{category.name}</strong>
              </Typography>
            )}
          </Box>
          {categoryId && (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
              <TextField
                label="Minimum charge per line"
                type="number"
                size="small"
                value={minCharge}
                onChange={(e) => setMinCharge(e.target.value)}
                helperText="Blank = none. Tiny runs are billed at least this much."
                sx={{ width: 260 }}
                slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> }, htmlInput: { step: 'any' } }}
              />
              <Button
                variant="contained"
                sx={{ mt: 0.25 }}
                disabled={minChargeUnchanged || saveMinCharge.isPending}
                onClick={() => saveMinCharge.mutate()}
              >
                {saveMinCharge.isPending ? 'Saving…' : 'Save'}
              </Button>
            </Box>
          )}
        </Box>
      </Paper>

      {!categoryId ? (
        <Alert severity="info">Pick a service above to manage its attributes, quantity slabs, extra charges, printing charge and GST.</Alert>
      ) : (
        <>
          <Paper sx={{ borderRadius: 2, mb: 3 }}>
            <Tabs value={tab} onChange={(_, v) => setTab(v)}>
              <Tab label="Attributes" />
              <Tab label="Quantity Slabs" />
              <Tab label="Extra Charges" />
              <Tab label="Printing & Tax" />
            </Tabs>
          </Paper>

          {tab === 0 && <AttributesPanel categoryId={categoryId} />}
          {tab === 1 && <QuantitySlabsPanel categoryId={categoryId} />}
          {tab === 2 && <ExtraChargesPanel categoryId={categoryId} />}
          {tab === 3 && category && <PrintingTaxPanel category={category} />}
        </>
      )}
    </Box>
  );
}
