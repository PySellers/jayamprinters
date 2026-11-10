import { useMemo, useState } from 'react';
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
 * A service whose items have SUB-CATEGORIES (Rubber Stamp: Polymer Stamp - A Series, Printer / Dater Stamp ...) asks the
 * sub-category first and then lists only the sizes of that sub-category.
 */
export default function ServiceItemPicker({ serviceName, products, onPick }: ServiceItemPickerProps) {
  const subCategories = useMemo(
    () => Array.from(new Set(products.map((p) => p.sub_category).filter((s): s is string => Boolean(s)))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [products],
  );
  const hasSubs = subCategories.length > 0;
  const [sub, setSub] = useState<string>('');
  // items without a sub-category are listed under "Other" so nothing is hidden
  const withoutSub = products.filter((p) => !p.sub_category);
  const groups = hasSubs && withoutSub.length > 0 ? [...subCategories, 'Other'] : subCategories;
  const shown = !hasSubs ? products : products.filter((p) => (sub === 'Other' ? !p.sub_category : p.sub_category === sub));

  return (
    <Paper sx={{ p: 3, borderRadius: 2, mb: 2 }}>
      <Typography variant="h6" sx={{ fontWeight: 700, color: '#1a237e', mb: 0.5 }}>
        {serviceName}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {hasSubs
          ? `Choose the sub-category first, then the item (${products.length} items in ${groups.length} sub-categories).`
          : `Choose the item for this order — click to see all ${products.length}, or type to search.`}
      </Typography>
      {hasSubs && (
        <div style={{ marginBottom: 16 }}>
          <SearchSelect
            required
            label="Sub-category"
            options={groups.map((g, i) => ({ id: i + 1, label: g }))}
            value={sub ? groups.indexOf(sub) + 1 : null}
            onChange={(id) => setSub(id ? groups[id - 1] : '')}
          />
        </div>
      )}
      <SearchSelect
        required
        label="Item / Size"
        disabled={hasSubs && !sub}
        helperText={hasSubs && !sub ? 'Choose the sub-category first' : undefined}
        options={shown.map((p) => ({ id: p.id, label: p.name }))}
        value={null}
        onChange={(id) => id != null && onPick(id)}
      />
    </Paper>
  );
}
