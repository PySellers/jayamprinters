import { Box, Button, Paper, Typography } from '@mui/material';
import type { Product } from '../../types/products';

interface ServiceItemPickerProps {
  serviceName: string;
  products: Product[];
  onPick: (productId: number) => void;
}

/**
 * Second screen of "Start New Order": the service was already chosen (one entry
 * per service), so this lists only that service's own items/sizes as big tiles.
 */
export default function ServiceItemPicker({ serviceName, products, onPick }: ServiceItemPickerProps) {
  return (
    <Paper sx={{ p: 3, borderRadius: 2, mb: 2 }}>
      <Typography variant="h6" sx={{ fontWeight: 700, color: '#1a237e' }}>
        {serviceName}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Choose the item for this order ({products.length} available)
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 1.5 }}>
        {products.map((p) => (
          <Button
            key={p.id}
            variant="outlined"
            onClick={() => onPick(p.id)}
            sx={{ py: 1.5, textTransform: 'none', fontWeight: 600, borderColor: '#1a237e', color: '#1a237e' }}
          >
            {p.name}
          </Button>
        ))}
      </Box>
    </Paper>
  );
}
