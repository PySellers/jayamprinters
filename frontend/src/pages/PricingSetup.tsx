import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Box, Typography, Paper, Tabs, Tab, Alert, TextField, Button, InputAdornment } from '@mui/material';
import EntitySelect from '../components/pickers/EntitySelect';
import { productCategoriesApi } from '../api/productsApi';
import AttributesPanel from '../components/pricingSetup/AttributesPanel';
import QuantitySlabsPanel from '../components/pricingSetup/QuantitySlabsPanel';
import ExtraChargesPanel from '../components/pricingSetup/ExtraChargesPanel';

export default function PricingSetup() {
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [tab, setTab] = useState(0);

  // Minimum amount billed for one line of this service (small runs cost more per unit).
  const queryClient = useQueryClient();
  const categoriesQuery = useQuery({ queryKey: ['product-categories'], queryFn: productCategoriesApi.list });
  const category = categoriesQuery.data?.find((c) => c.id === categoryId);
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
          <Box sx={{ width: 400, maxWidth: '100%' }}>
            <EntitySelect
              label="Product Category"
              mode="list"
              queryKey="product-category-picker"
              fetchOptions={productCategoriesApi.list}
              getOptionLabel={(c) => c.name}
              value={categoryId}
              onChange={setCategoryId}
            />
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
        <Alert severity="info">Select a category to manage its attributes, quantity slabs, and extra charges.</Alert>
      ) : (
        <>
          <Paper sx={{ borderRadius: 2, mb: 3 }}>
            <Tabs value={tab} onChange={(_, v) => setTab(v)}>
              <Tab label="Attributes" />
              <Tab label="Quantity Slabs" />
              <Tab label="Extra Charges" />
            </Tabs>
          </Paper>

          {tab === 0 && <AttributesPanel categoryId={categoryId} />}
          {tab === 1 && <QuantitySlabsPanel categoryId={categoryId} />}
          {tab === 2 && <ExtraChargesPanel categoryId={categoryId} />}
        </>
      )}
    </Box>
  );
}
