import { useMemo, useState, useEffect } from 'react';
import {
  Box, Table, TableHead, TableRow, TableCell, TableBody, TextField, Button,
  Alert, Stack, Paper,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import type { Attribute } from '../../types/attributes';
import type { QuantitySlab } from '../../types/quantitySlabs';
import type { PriceMatrixCell, PriceMatrixCellInput } from '../../types/priceMatrix';

interface BulkPriceGridProps {
  productId: number;
  attributes: Attribute[];
  slabs: QuantitySlab[];
  cells: PriceMatrixCell[];
  onSaveAll: (cells: PriceMatrixCellInput[]) => void;
  saving?: boolean;
}

interface Combo {
  key: string;
  label: string;
  options: { attribute_id: number; attribute_option_id: number }[];
}

function buildCombos(attributes: Attribute[]): Combo[] {
  const requiredAttrs = attributes.filter((a) => a.is_required && a.options.length > 0);
  if (requiredAttrs.length === 0) return [{ key: 'none', label: '—', options: [] }];

  let combos: Combo[] = [{ key: '', label: '', options: [] }];
  for (const attr of requiredAttrs) {
    const next: Combo[] = [];
    for (const combo of combos) {
      for (const opt of attr.options) {
        next.push({
          key: `${combo.key}|${attr.id}:${opt.id}`,
          label: combo.label ? `${combo.label} / ${opt.value}` : opt.value,
          options: [...combo.options, { attribute_id: attr.id, attribute_option_id: opt.id }],
        });
      }
    }
    combos = next;
  }
  return combos;
}

function comboMatchesCell(combo: Combo, cell: PriceMatrixCell): boolean {
  const cellSet = new Set(cell.options.map((o) => `${o.attribute_id}:${o.attribute_option_id}`));
  const comboSet = new Set(combo.options.map((o) => `${o.attribute_id}:${o.attribute_option_id}`));
  if (cellSet.size !== comboSet.size) return false;
  for (const key of comboSet) if (!cellSet.has(key)) return false;
  return true;
}

export default function BulkPriceGrid({ productId, attributes, slabs, cells, onSaveAll, saving }: BulkPriceGridProps) {
  const combos = useMemo(() => buildCombos(attributes), [attributes]);
  const sortedSlabs = useMemo(() => [...slabs].sort((a, b) => a.display_order - b.display_order), [slabs]);

  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const initial: Record<string, string> = {};
    for (const slab of sortedSlabs) {
      for (const combo of combos) {
        const existing = cells.find((c) => c.quantity_slab_id === slab.id && comboMatchesCell(combo, c));
        initial[`${slab.id}::${combo.key}`] = existing ? String(existing.unit_price) : '0';
      }
    }
    setValues(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells, sortedSlabs.length, combos.length]);

  const handleChange = (slabId: number, comboKey: string, value: string) => {
    setValues((prev) => ({ ...prev, [`${slabId}::${comboKey}`]: value }));
  };

  const handleSaveAll = () => {
    const payload: PriceMatrixCellInput[] = [];
    for (const slab of sortedSlabs) {
      for (const combo of combos) {
        const raw = values[`${slab.id}::${combo.key}`];
        payload.push({
          product_id: productId,
          quantity_slab_id: slab.id,
          unit_price: parseFloat(raw) || 0,
          is_active: true,
          options: combo.options,
        });
      }
    }
    onSaveAll(payload);
  };

  if (sortedSlabs.length === 0) {
    return <Alert severity="info">Add at least one quantity slab for this category before using the bulk grid.</Alert>;
  }

  const totalCells = sortedSlabs.length * combos.length;

  return (
    <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
      <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
        <Stack>
          <Alert severity="info" sx={{ mb: 0 }}>
            Rows = quantity slabs, columns = attribute combinations. Edit any cell, then Save All applies every value
            in one go ({totalCells} cells).
          </Alert>
        </Stack>
      </Box>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 'bold', minWidth: 140 }}>Quantity Slab</TableCell>
              {combos.map((combo) => (
                <TableCell key={combo.key} sx={{ fontWeight: 'bold', minWidth: 120 }}>{combo.label}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedSlabs.map((slab) => (
              <TableRow key={slab.id}>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  {slab.label || `${slab.min_quantity} – ${slab.max_quantity ?? '∞'}`}
                </TableCell>
                {combos.map((combo) => (
                  <TableCell key={combo.key}>
                    <TextField
                      size="small"
                      type="number"
                      value={values[`${slab.id}::${combo.key}`] ?? '0'}
                      onChange={(e) => handleChange(slab.id, combo.key, e.target.value)}
                      sx={{ width: 100 }}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
      <Box sx={{ p: 2, display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid rgba(0,0,0,0.08)' }}>
        <Button variant="contained" startIcon={<SaveIcon />} sx={{ bgcolor: '#1a237e' }} onClick={handleSaveAll} disabled={saving}>
          Save All
        </Button>
      </Box>
    </Paper>
  );
}
