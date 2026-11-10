import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, Chip, IconButton, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { inventoryApi } from '../../api/inventoryApi';
import { jobMaterialsApi } from '../../api/extraApi';
import { getErrorMessage } from '../../utils/api';

/**
 * Stock used by this job (paper, binding material, a customer's own sheets ...). Adding a line takes the quantity out of
 * the stock at once; removing it puts it back. The shop's own items that run low are flagged so they get bought.
 */
export default function JobMaterialsPanel({ jobCardId, canEdit }: { jobCardId: number; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const materials = useQuery({ queryKey: ['job-materials', jobCardId], queryFn: () => jobMaterialsApi.list(jobCardId) });
  const stock = useQuery({ queryKey: ['inventory'], queryFn: inventoryApi.list, enabled: canEdit });
  const [itemId, setItemId] = useState<number | ''>('');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');

  const refresh = () => {
    ['job-materials', 'inventory', 'low-stock'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
  };
  const add = useMutation({
    mutationFn: () => jobMaterialsApi.add(jobCardId, { inventory_item_id: Number(itemId), quantity: Number(qty), note: note.trim() || null }),
    onSuccess: () => { setItemId(''); setQty(''); setNote(''); refresh(); },
  });
  const remove = useMutation({ mutationFn: (id: number) => jobMaterialsApi.remove(id), onSuccess: refresh });

  const rows = materials.data ?? [];
  const chosen = (stock.data ?? []).find((s) => s.id === itemId);

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }} data-testid="job-materials">
      <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#1a237e', mb: 0.5 }}>Materials used (taken from stock)</Typography>
      <Typography variant="caption" color="text.secondary">The quantity you add is reduced from the stock straight away; remove a line to put it back.</Typography>
      {rows.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>No material recorded for this job yet.</Typography>}
      <Stack spacing={0.5} sx={{ mt: 1 }}>
        {rows.map((m) => (
          <Box key={m.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }} data-testid="material-row">
            <Typography variant="body2" sx={{ fontWeight: 700 }}>{m.item_name}</Typography>
            <Typography variant="body2">{m.quantity} {m.unit}</Typography>
            {m.customer_name && <Chip size="small" variant="outlined" label="Customer's own" />}
            <Typography variant="caption" color="text.secondary">
              {m.stock_left} {m.unit} left{m.note ? ` · ${m.note}` : ''}{m.created_by ? ` · ${m.created_by}` : ''}
            </Typography>
            {m.low_stock && <Chip size="small" color="warning" label="Running low - buy more" />}
            {canEdit && (
              <IconButton size="small" aria-label="Put back in stock" onClick={() => remove.mutate(m.id)}><DeleteIcon fontSize="small" /></IconButton>
            )}
          </Box>
        ))}
      </Stack>
      {canEdit && (
        <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <TextField select size="small" label="Stock item" value={itemId} onChange={(e) => setItemId(Number(e.target.value))} sx={{ minWidth: 260 }}
            slotProps={{ htmlInput: { 'data-testid': 'material-item' } }}>
            {(stock.data ?? []).map((s) => (
              <MenuItem key={s.id} value={s.id}>{s.name} ({s.current_qty} {s.unit})</MenuItem>
            ))}
          </TextField>
          <TextField size="small" type="number" label={chosen ? `Quantity (${chosen.unit})` : 'Quantity'} value={qty} onChange={(e) => setQty(e.target.value)} sx={{ width: 150 }}
            slotProps={{ htmlInput: { min: 0, step: 'any', 'data-testid': 'material-qty' } }} />
          <TextField size="small" label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} sx={{ width: 200 }} />
          <Button variant="contained" size="small" sx={{ mt: 0.25, bgcolor: '#1a237e' }} disabled={!itemId || !(Number(qty) > 0) || add.isPending} onClick={() => add.mutate()} data-testid="material-add">
            Use from stock
          </Button>
        </Box>
      )}
      {add.isError && <Alert severity="error" sx={{ mt: 1 }}>{getErrorMessage(add.error, 'Could not use that material')}</Alert>}
    </Paper>
  );
}
