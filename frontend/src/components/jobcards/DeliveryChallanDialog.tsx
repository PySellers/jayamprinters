import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { deliveryChallansApi } from '../../api/deliveryChallansApi';
import { getErrorMessage } from '../../utils/api';
import type { DeliveryChallan, DeliveryChallanInput } from '../../types/deliveryChallans';
import type { JobCard } from '../../types/jobCards';

interface Props {
  jobCard: JobCard | null;
  onClose: () => void;
}

type Busy = 'save' | 'view' | 'download' | null;

export default function DeliveryChallanDialog({ jobCard, onClose }: Props) {
  const queryClient = useQueryClient();
  const open = Boolean(jobCard);

  const draftQuery = useQuery({
    queryKey: ['delivery-challan-draft', jobCard?.id],
    queryFn: () => deliveryChallansApi.draft(jobCard!.id),
    enabled: open,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const [form, setForm] = useState<DeliveryChallanInput | null>(null);
  const [saved, setSaved] = useState<DeliveryChallan | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  // Opening the dialog for a different job card must not show the previous one's form.
  useEffect(() => {
    setForm(null);
    setSaved(null);
    setError(null);
  }, [jobCard?.id]);

  // (Re)load the form whenever a job card's draft / saved challan arrives.
  useEffect(() => {
    const data = draftQuery.data;
    if (!data) return;
    setSaved(data.id ? data : null);
    setForm({
      challan_date: data.challan_date,
      to_text: data.to_text,
      items: data.items.length ? data.items : [{ particulars: '', qty: '' }],
    });
    setError(null);
  }, [draftQuery.data]);

  const shown = saved ?? draftQuery.data ?? null;

  const setItem = (index: number, field: 'particulars' | 'qty', value: string) =>
    setForm((f) => f && { ...f, items: f.items.map((it, i) => (i === index ? { ...it, [field]: value } : it)) });

  const persist = async (): Promise<DeliveryChallan> => {
    if (!form || !jobCard) throw new Error('Nothing to save');
    const payload: DeliveryChallanInput = {
      ...form,
      items: form.items.filter((it) => it.particulars.trim() || it.qty.trim()),
    };
    const result = saved?.id
      ? await deliveryChallansApi.update(saved.id, payload)
      : await deliveryChallansApi.create(jobCard.id, payload);
    setSaved(result);
    queryClient.invalidateQueries({ queryKey: ['delivery-challans'] });
    queryClient.invalidateQueries({ queryKey: ['delivery-challan-draft', jobCard.id] });
    return result;
  };

  const run = async (kind: Exclude<Busy, null>) => {
    setError(null);
    setBusy(kind);
    // Open the PDF tab right now, inside the click, or pop-up blockers stop it.
    const popup = kind === 'view' ? window.open('', '_blank') : null;
    try {
      const result = await persist();
      if (kind === 'view') await deliveryChallansApi.viewPdf(result.id!, popup);
      if (kind === 'download') {
        await deliveryChallansApi.downloadPdf(result.id!, `DC-${result.financial_year_label}-${result.dc_number}.pdf`);
      }
    } catch (e) {
      popup?.close();
      setError(getErrorMessage(e, 'Could not save the delivery challan'));
    } finally {
      setBusy(null);
    }
  };

  const canSave = Boolean(form?.challan_date) && busy === null;

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ bgcolor: '#2f3d97', color: 'white', textAlign: 'center', letterSpacing: 1 }}>
        DELIVERY CHALLAN
      </DialogTitle>
      <DialogContent sx={{ bgcolor: '#f4f5fb' }}>
        {draftQuery.isLoading || !form ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <CircularProgress />
          </Box>
        ) : (
          <Stack spacing={2} sx={{ mt: 2 }}>
            {error && <Alert severity="error">{error}</Alert>}

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Paper sx={{ p: 1.5, minWidth: 190 }}>
                <Typography variant="caption" color="text.secondary">
                  S.No.
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 800, color: '#1a237e', lineHeight: 1.1 }}>
                  {shown?.dc_number}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Year {shown?.financial_year_label} — restarts at 1 every April
                  {saved?.id ? '' : ' (number is given when you save)'}
                </Typography>
              </Paper>
              <TextField
                label="Date"
                type="date"
                required
                value={form.challan_date}
                onChange={(e) => setForm({ ...form, challan_date: e.target.value })}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ bgcolor: 'white', minWidth: 200 }}
              />
            </Stack>

            <TextField
              label="To (up to 3 lines)"
              multiline
              rows={3}
              fullWidth
              value={form.to_text}
              onChange={(e) => setForm({ ...form, to_text: e.target.value })}
              sx={{ bgcolor: 'white' }}
            />

            <Paper sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 60 }}>S.No.</TableCell>
                    <TableCell>Particulars</TableCell>
                    <TableCell sx={{ width: 140 }}>Qty</TableCell>
                    <TableCell sx={{ width: 50 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {form.items.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>
                        <TextField
                          variant="standard"
                          fullWidth
                          value={item.particulars}
                          onChange={(e) => setItem(index, 'particulars', e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          variant="standard"
                          fullWidth
                          value={item.qty}
                          onChange={(e) => setItem(index, 'qty', e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <IconButton
                          size="small"
                          disabled={form.items.length === 1}
                          onClick={() => setForm({ ...form, items: form.items.filter((_, i) => i !== index) })}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Box sx={{ p: 1 }}>
                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={() => setForm({ ...form, items: [...form.items, { particulars: '', qty: '' }] })}
                >
                  Add row
                </Button>
              </Box>
            </Paper>
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={busy !== null}>
          Close
        </Button>
        <Button variant="outlined" disabled={!canSave} onClick={() => run('save')}>
          {busy === 'save' ? <CircularProgress size={18} /> : saved?.id ? 'Save changes' : 'Save'}
        </Button>
        <Button
          variant="outlined"
          startIcon={busy === 'view' ? <CircularProgress size={16} /> : <VisibilityIcon />}
          disabled={!canSave}
          onClick={() => run('view')}
        >
          Save &amp; View
        </Button>
        <Button
          variant="contained"
          sx={{ bgcolor: '#1a237e' }}
          startIcon={busy === 'download' ? <CircularProgress size={16} color="inherit" /> : <DownloadIcon />}
          disabled={!canSave}
          onClick={() => run('download')}
        >
          Save &amp; Download
        </Button>
      </DialogActions>
    </Dialog>
  );
}