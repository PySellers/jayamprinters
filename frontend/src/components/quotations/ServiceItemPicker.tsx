import { Paper, Typography } from '@mui/material';
import type { Product } from '../../types/products';
import SearchSelect from './SearchSelect';

interface ServiceItemPickerProps {
  serviceName: string;
  products: Product[];
  onPick: (productId: number) => void;
}

/**
 * Second screen of "Start New Order": the service was already chosen (one entry
 * per service), so this is a single searchable dropdown of that service's own
 * items/sizes -- type to filter instead of scrolling a wall of tiles.
 */
export default function ServiceItemPicker({ serviceName, products, onPick }: ServiceItemPickerProps) {
  return (
    <Paper sx={{ p: 3, borderRadius: 2, mb: 2 }}>
      <Typography variant="h6" sx={{ fontWeight: 700, color: '#1a237e', mb: 0.5 }}>
        {serviceName}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Choose the item for this order — click to see all {products.length}, or type to search.
      </Typography>
      <SearchSelect
        required
        label="Item / Size"
        options={products.map((p) => ({ id: p.id, label: p.name }))}
        value={null}
        onChange={(id) => id != null && onPick(id)}
      />
    </Paper>
  );
}
