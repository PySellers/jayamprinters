import { useState } from 'react';
import { Box, Typography, Paper, Tabs, Tab, Alert } from '@mui/material';
import EntitySelect from '../components/pickers/EntitySelect';
import { productCategoriesApi } from '../api/productsApi';
import AttributesPanel from '../components/pricingSetup/AttributesPanel';
import QuantitySlabsPanel from '../components/pricingSetup/QuantitySlabsPanel';
import ExtraChargesPanel from '../components/pricingSetup/ExtraChargesPanel';

export default function PricingSetup() {
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [tab, setTab] = useState(0);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 3 }}>
        Pricing Setup
      </Typography>

      <Paper sx={{ p: 3, borderRadius: 2, mb: 3 }}>
        <Box sx={{ maxWidth: 400 }}>
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
