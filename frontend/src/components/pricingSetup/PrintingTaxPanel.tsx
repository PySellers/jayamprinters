import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Box, Button, FormControlLabel, InputAdornment, MenuItem, Paper, Switch, TextField, Typography,
} from '@mui/material';
import { productCategoriesApi, printBandsApi } from '../../api/productsApi';
import { hsnApi } from '../../api/companyApi';
import { getErrorMessage } from '../../utils/api';
import type { PrintChargeBand, ProductCategory } from '../../types/products';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { IconButton, Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material';

type Mode = '' | 'block' | 'per_copy' | 'slab';
const MONEY = { htmlInput: { step: 'any', min: 0 } } as const;
const RUPEE = <InputAdornment position="start">₹</InputAdornment>;

/**
 * Printing charge (on top of the paper cost) and the default HSN / GST for one service.
 * Printing can be charged per block of copies ("₹500 up to 1,000 copies, ₹1,000 up to 2,000 ...") or per copy.
 */
export default function PrintingTaxPanel({ category }: { category: ProductCategory }) {
  const queryClient = useQueryClient();
  const hsnQuery = useQuery({ queryKey: ['hsn-codes'], queryFn: hsnApi.list });

  const [mode, setMode] = useState<Mode>('');
  const [blockSize, setBlockSize] = useState('');
  const [blockRate, setBlockRate] = useState('');
  const [copyRate, setCopyRate] = useState('');
  const [perLayer, setPerLayer] = useState(false);
  const [hsnId, setHsnId] = useState<number | ''>('');
  const [bands, setBands] = useState<PrintChargeBand[]>([]);
  const bandsQuery = useQuery({ queryKey: ['print-bands', category.id], queryFn: () => printBandsApi.list(category.id) });
  useEffect(() => {
    if (bandsQuery.data) setBands(bandsQuery.data.length ? bandsQuery.data : [{ min_quantity: 1, max_quantity: 1000, amount: 0, per_block: false, block_size: null }]);
  }, [bandsQuery.data]);

  useEffect(() => {
    setMode((category.print_charge_mode as Mode) ?? '');
    setBlockSize(category.print_block_size != null ? String(category.print_block_size) : '');
    setBlockRate(category.print_block_rate != null ? String(category.print_block_rate) : '');
    setCopyRate(category.print_per_copy_rate != null ? String(category.print_per_copy_rate) : '');
    setPerLayer(Boolean(category.print_per_layer));
    setHsnId(category.hsn_id ?? '');
  }, [category]);

  const save = useMutation({
    mutationFn: async () => {
      if (mode === 'slab') {
        const saved = await printBandsApi.save(category.id, bands);
        setBands(saved);
        queryClient.invalidateQueries({ queryKey: ['print-bands', category.id] });
      }
      return productCategoriesApi.update(category.id, {
        hsn_id: hsnId === '' ? null : hsnId,
        print_charge_mode: mode === '' ? null : mode,
        print_block_size: mode === 'block' && blockSize ? Math.max(1, Math.round(Number(blockSize))) : null,
        print_block_rate: mode === 'block' && blockRate ? Number(blockRate) : null,
        print_per_copy_rate: mode === 'per_copy' && copyRate ? Number(copyRate) : null,
        print_per_layer: mode === '' ? false : perLayer,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-categories'] });
      queryClient.invalidateQueries({ queryKey: ['product-category-picker'] });
    },
  });

  const size = Number(blockSize) || 0;
  const rate = Number(blockRate) || 0;
  const hsn = (hsnQuery.data ?? []).find((h) => h.id === hsnId);

  return (
    <Box sx={{ display: 'grid', gap: 3, maxWidth: 820 }}>
      <Paper sx={{ p: 3, borderRadius: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>Printing charge</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Added on top of the paper cost for every order of this service, and shown on the order screen.
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <TextField select size="small" label="How is printing charged?" value={mode} onChange={(e) => setMode(e.target.value as Mode)} sx={{ width: 280 }}>
            <MenuItem value="">No separate printing charge</MenuItem>
            <MenuItem value="block">Per block of copies (e.g. ₹500 per 1,000)</MenuItem>
            <MenuItem value="per_copy">Per copy</MenuItem>
            <MenuItem value="slab">By quantity bands (a table: up to 1,000 = ₹500, each further 1,000 = ...)</MenuItem>
          </TextField>
          {mode === 'block' && (
            <>
              <TextField size="small" type="number" label="Copies in one block" value={blockSize} onChange={(e) => setBlockSize(e.target.value)} sx={{ width: 190 }} slotProps={{ htmlInput: { min: 1, step: 1 } }} />
              <TextField size="small" type="number" label="Charge per block" value={blockRate} onChange={(e) => setBlockRate(e.target.value)} sx={{ width: 190 }} slotProps={{ ...MONEY, input: { startAdornment: RUPEE } }} />
            </>
          )}
          {mode === 'per_copy' && (
            <TextField size="small" type="number" label="Charge per copy" value={copyRate} onChange={(e) => setCopyRate(e.target.value)} sx={{ width: 190 }} slotProps={{ ...MONEY, input: { startAdornment: RUPEE } }} />
          )}
        </Box>
        {mode === 'slab' && (
          <Box sx={{ mt: 2 }} data-testid="print-bands">
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              The band that holds the number of pages printed decides the printing charge. A <strong>"for each block"</strong> band adds its amount for
              every started block above its start, on top of the charge at the top of the band before it (e.g. 1 to 1,000 = ₹500, then above 1,000 add ₹2,000 for each 1,000).
              Change any amount here and new orders use it straight away.
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>From</TableCell><TableCell>To (blank = no limit)</TableCell><TableCell>Charge ₹</TableCell>
                  <TableCell>Added for each block?</TableCell><TableCell>Block size</TableCell><TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {bands.map((b, i) => (
                  <TableRow key={i} data-testid="print-band">
                    <TableCell><TextField size="small" type="number" value={b.min_quantity} onChange={(e) => setBands((p) => p.map((x, k) => (k === i ? { ...x, min_quantity: Math.max(1, Number(e.target.value) || 1) } : x)))} sx={{ width: 100 }} slotProps={{ htmlInput: { 'data-testid': 'band-from' } }} /></TableCell>
                    <TableCell><TextField size="small" type="number" value={b.max_quantity ?? ''} onChange={(e) => setBands((p) => p.map((x, k) => (k === i ? { ...x, max_quantity: e.target.value === '' ? null : Number(e.target.value) } : x)))} sx={{ width: 110 }} slotProps={{ htmlInput: { 'data-testid': 'band-to' } }} /></TableCell>
                    <TableCell><TextField size="small" type="number" value={b.amount} onChange={(e) => setBands((p) => p.map((x, k) => (k === i ? { ...x, amount: Math.max(0, Number(e.target.value) || 0) } : x)))} sx={{ width: 110 }} slotProps={{ htmlInput: { step: 'any', 'data-testid': 'band-amount' } }} /></TableCell>
                    <TableCell><Switch checked={b.per_block} onChange={(e) => setBands((p) => p.map((x, k) => (k === i ? { ...x, per_block: e.target.checked, block_size: e.target.checked ? x.block_size ?? 1000 : null } : x)))} slotProps={{ input: { 'aria-label': 'Added for each block' } }} /></TableCell>
                    <TableCell>{b.per_block && <TextField size="small" type="number" value={b.block_size ?? ''} onChange={(e) => setBands((p) => p.map((x, k) => (k === i ? { ...x, block_size: Math.max(1, Number(e.target.value) || 1) } : x)))} sx={{ width: 100 }} />}</TableCell>
                    <TableCell><IconButton size="small" aria-label="Remove band" disabled={bands.length === 1} onClick={() => setBands((p) => p.filter((_, k) => k !== i))}><DeleteIcon fontSize="small" /></IconButton></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Button size="small" startIcon={<AddIcon />} sx={{ mt: 1 }} onClick={() => setBands((p) => {
              const last = p[p.length - 1];
              const start = last ? (last.max_quantity != null ? last.max_quantity + 1 : last.min_quantity + (last.block_size ?? 1000)) : 1;
              return [...p.map((x, k) => (k === p.length - 1 && x.max_quantity == null ? { ...x, max_quantity: start - 1 } : x)), { min_quantity: start, max_quantity: null, amount: 0, per_block: false, block_size: null }];
            })}>Add a band</Button>
          </Box>
        )}
        {mode === 'block' && size > 0 && rate > 0 && (
          <Alert severity="info" sx={{ mt: 2 }}>
            Up to {size.toLocaleString('en-IN')} copies: ₹{rate.toLocaleString('en-IN')} · up to {(size * 2).toLocaleString('en-IN')}: ₹{(rate * 2).toLocaleString('en-IN')} ·
            up to {(size * 3).toLocaleString('en-IN')}: ₹{(rate * 3).toLocaleString('en-IN')} … (a part block is charged as a full block)
          </Alert>
        )}
        {mode !== '' && (
          <FormControlLabel
            sx={{ mt: 1.5, display: 'block' }}
            control={<Switch checked={perLayer} onChange={(e) => setPerLayer(e.target.checked)} />}
            label={mode === 'slab' ? 'Count every copy of a set as a printed page (1+2 copies x 1,000 = 3,000 pages)' : 'Multiply by the number of copies in a set (1+2 = 3 printed layers)'}
          />
        )}
      </Paper>

      <Paper sx={{ p: 3, borderRadius: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>HSN / GST</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          The HSN code of this service decides the GST rate on its orders. An item can use a different code from the Products screen.
          Manage the codes under Masters &gt; HSN Codes.
        </Typography>
        <TextField select size="small" label="HSN / SAC code" value={hsnId} onChange={(e) => setHsnId(e.target.value === '' ? '' : Number(e.target.value))} sx={{ width: 420, maxWidth: '100%' }}>
          <MenuItem value="">None - use the default tax rate</MenuItem>
          {(hsnQuery.data ?? []).filter((h) => h.is_active || h.id === hsnId).map((h) => (
            <MenuItem key={h.id} value={h.id}>{h.code} - {h.gst_rate}% {h.description ? `(${h.description.slice(0, 40)})` : ''}</MenuItem>
          ))}
        </TextField>
        {hsn && <Typography variant="body2" sx={{ mt: 1.5 }}>Orders will carry CGST {hsn.gst_rate / 2}% + SGST {hsn.gst_rate / 2}% (total {hsn.gst_rate}%).</Typography>}
      </Paper>

      {save.isError && <Alert severity="error">{getErrorMessage(save.error, 'Could not save')}</Alert>}
      {save.isSuccess && !save.isPending && <Alert severity="success">Saved. New orders use these settings.</Alert>}
      <Box>
        <Button variant="contained" sx={{ bgcolor: '#1a237e' }} onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save printing & tax'}
        </Button>
      </Box>
    </Box>
  );
}
