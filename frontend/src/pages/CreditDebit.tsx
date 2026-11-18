import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Autocomplete, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Grid,
  IconButton, InputAdornment, Paper, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import EditIcon from '@mui/icons-material/Edit';
import ClearIcon from '@mui/icons-material/Clear';
import { creditDebitApi } from '../api/creditDebitApi';
import { getErrorMessage } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import ConfirmDialog from '../components/ConfirmDialog';
import type { CreditDebitEntry, CreditDebitFilters, CreditDebitKind } from '../types/creditDebit';

const money = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const showDate = (d: string) => (d ? d.split('-').reverse().join('-') : '');
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const THEME: Record<CreditDebitKind, { title: string; colour: string; bg: string; verb: string }> = {
  credit: { title: 'Credit', colour: '#1b5e20', bg: '#e8f5e9', verb: 'Add credit' },
  debit: { title: 'Debit', colour: '#b71c1c', bg: '#fdecea', verb: 'Add debit' },
};

interface BookProps {
  kind: CreditDebitKind;
  filters: CreditDebitFilters;
  names: string[];
  canDelete: boolean;
}

/** One side of the book: the entry form on top and the entries (newest first) below. */
function Book({ kind, filters, names, canDelete }: BookProps) {
  const queryClient = useQueryClient();
  const theme = THEME[kind];
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayStr());
  const [submitted, setSubmitted] = useState(false);
  const [editing, setEditing] = useState<CreditDebitEntry | null>(null);
  const [deleting, setDeleting] = useState<CreditDebitEntry | null>(null);

  const listQuery = useQuery({ queryKey: ['credit-debit', 'entries', kind, filters], queryFn: () => creditDebitApi.list(kind, filters) });
  const entries = listQuery.data ?? [];
  const total = entries.reduce((sum, e) => sum + e.amount, 0);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['credit-debit'] });
  };

  const addMutation = useMutation({
    mutationFn: () => creditDebitApi.add({ kind, name: name.trim(), amount: Number(amount), note: note.trim() || null, entry_date: date || null }),
    onSuccess: () => {
      refresh();
      setName('');
      setAmount('');
      setNote('');
      setDate(todayStr());
      setSubmitted(false);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => creditDebitApi.remove(id),
    onSuccess: () => {
      refresh();
      setDeleting(null);
    },
  });

  const nameError = !name.trim() ? 'Enter the name' : '';
  const amountError = !(Number(amount) > 0) ? 'Enter an amount above 0' : '';
  const valid = !nameError && !amountError;
  const submit = () => {
    setSubmitted(true);
    if (valid) addMutation.mutate();
  };

  return (
    <Paper sx={{ borderRadius: 3, overflow: 'hidden', border: `1px solid ${theme.colour}33` }} data-testid={`book-${kind}`}>
      <Box sx={{ bgcolor: theme.bg, px: 2, py: 1.25, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6" sx={{ fontWeight: 800, color: theme.colour }}>{theme.title} entries</Typography>
        <Typography sx={{ fontWeight: 800, color: theme.colour }} data-testid={`total-${kind}`}>₹{money(total)}</Typography>
      </Box>

      <Box sx={{ p: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>New {kind} entry</Typography>
        <Grid container spacing={1.25} component="form" noValidate onSubmit={(e: React.FormEvent) => { e.preventDefault(); submit(); }}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Autocomplete
              freeSolo
              size="small"
              options={names}
              inputValue={name}
              onInputChange={(_, v) => setName(v)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Name"
                  required
                  error={submitted && Boolean(nameError)}
                  helperText={submitted && nameError ? nameError : undefined}
                  slotProps={{ ...params.slotProps, htmlInput: { ...params.slotProps.htmlInput, maxLength: 120, 'data-testid': `${kind}-name`, autoComplete: 'off' } }}
                />
              )}
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <TextField
              size="small" fullWidth required type="number" label="Amount" value={amount} onChange={(e) => setAmount(e.target.value)}
              error={submitted && Boolean(amountError)} helperText={submitted && amountError ? amountError : undefined}
              slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> }, htmlInput: { min: 0, step: 'any', 'data-testid': `${kind}-amount` } }}
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <TextField
              size="small" fullWidth type="date" label="Date" value={date} onChange={(e) => setDate(e.target.value)}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': `${kind}-date` } }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 9 }}>
            <TextField
              size="small" fullWidth label="Note" value={note} onChange={(e) => setNote(e.target.value)}
              slotProps={{ htmlInput: { maxLength: 500, 'data-testid': `${kind}-note` } }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 3 }}>
            <Button
              type="submit" fullWidth variant="contained" startIcon={addMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <AddIcon />}
              disabled={addMutation.isPending} data-testid={`${kind}-add`} sx={{ bgcolor: theme.colour, '&:hover': { bgcolor: theme.colour }, height: 40, whiteSpace: 'nowrap' }}
            >
              {theme.verb}
            </Button>
          </Grid>
        </Grid>
        {addMutation.isError && <Alert severity="error" sx={{ mt: 1 }}>{getErrorMessage(addMutation.error, 'Could not save the entry')}</Alert>}
      </Box>

      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small" data-testid={`table-${kind}`}>
          <TableHead>
            <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: '#f3f5fc' } }}>
              <TableCell>Date</TableCell>
              <TableCell>Name</TableCell>
              <TableCell align="right">Amount</TableCell>
              <TableCell>Note</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {listQuery.isLoading && (
              <TableRow><TableCell colSpan={5} align="center"><CircularProgress size={22} /></TableCell></TableRow>
            )}
            {entries.map((e) => (
              <TableRow key={e.id} hover data-testid={`${kind}-row`}>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{showDate(e.entry_date)}</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{e.name}</TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 700, color: theme.colour }}>₹{money(e.amount)}</TableCell>
                <TableCell sx={{ maxWidth: 240, wordBreak: 'break-word' }}>{e.note || '-'}</TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  <Tooltip title="Edit this entry"><IconButton size="small" aria-label="Edit entry" data-testid={`${kind}-edit`} onClick={() => setEditing(e)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                  {canDelete && (
                    <Tooltip title="Delete this entry"><IconButton size="small" aria-label="Delete entry" data-testid={`${kind}-delete`} onClick={() => setDeleting(e)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!listQuery.isLoading && entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ color: 'text.secondary', py: 3 }}>
                  No {kind} entries{Object.values(filters).some(Boolean) ? ' for this filter' : ' yet'}.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Box>

      <EditEntryDialog entry={editing} names={names} onClose={() => setEditing(null)} onSaved={refresh} />
      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete entry"
        message={deleting ? `Delete the ${kind} entry of ₹${money(deleting.amount)} for ${deleting.name} (${showDate(deleting.entry_date)})? This cannot be undone.` : ''}
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </Paper>
  );
}

function EditEntryDialog({ entry, names, onClose, onSaved }: { entry: CreditDebitEntry | null; names: string[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState('');
  const [loadedId, setLoadedId] = useState<number | null>(null);
  if (entry && entry.id !== loadedId) {
    setLoadedId(entry.id);
    setName(entry.name);
    setAmount(String(entry.amount));
    setNote(entry.note ?? '');
    setDate(entry.entry_date);
  }
  const saveMutation = useMutation({
    mutationFn: () => creditDebitApi.update(entry!.id, { name: name.trim(), amount: Number(amount), note: note.trim() || null, entry_date: date }),
    onSuccess: () => {
      onSaved();
      setLoadedId(null);
      onClose();
    },
  });
  const valid = name.trim() && Number(amount) > 0 && date;
  return (
    <Dialog open={Boolean(entry)} onClose={onClose} maxWidth="xs" fullWidth data-testid="edit-entry-dialog">
      <DialogTitle>Edit {entry?.kind} entry</DialogTitle>
      <DialogContent>
        {saveMutation.isError && <Alert severity="error" sx={{ mb: 2 }}>{getErrorMessage(saveMutation.error, 'Could not save the entry')}</Alert>}
        <Box sx={{ display: 'grid', gap: 2, mt: 1 }}>
          <Autocomplete
            freeSolo size="small" options={names} inputValue={name} onInputChange={(_, v) => setName(v)}
            renderInput={(params) => <TextField {...params} label="Name" required slotProps={{ ...params.slotProps, htmlInput: { ...params.slotProps.htmlInput, maxLength: 120, 'data-testid': 'edit-entry-name' } }} />}
          />
          <TextField size="small" type="number" label="Amount" required value={amount} onChange={(e) => setAmount(e.target.value)}
            slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> }, htmlInput: { min: 0, step: 'any', 'data-testid': 'edit-entry-amount' } }} />
          <TextField size="small" type="date" label="Date" required value={date} onChange={(e) => setDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" label="Note" multiline minRows={2} value={note} onChange={(e) => setNote(e.target.value)} slotProps={{ htmlInput: { maxLength: 500, 'data-testid': 'edit-entry-note' } }} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saveMutation.isPending}>Cancel</Button>
        <Button variant="contained" disabled={!valid || saveMutation.isPending} onClick={() => saveMutation.mutate()} data-testid="edit-entry-save">Save</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function CreditDebit() {
  const { user } = useAuth();
  const canDelete = user?.role === 'admin' || user?.role === 'accounts';
  const [name, setName] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [exportError, setExportError] = useState<string | null>(null);
  const filters: CreditDebitFilters = { name: name.trim(), date_from: from, date_to: to };
  const rangeError = from && to && from > to ? 'The "from" date is after the "to" date' : '';
  const activeFilters = rangeError ? { name: name.trim() } : filters;

  const namesQuery = useQuery({ queryKey: ['credit-debit', 'names'], queryFn: creditDebitApi.names });
  const summaryQuery = useQuery({ queryKey: ['credit-debit', 'summary', activeFilters], queryFn: () => creditDebitApi.summary(activeFilters) });
  const summary = summaryQuery.data;
  const [showBalances, setShowBalances] = useState(false);

  async function exportExcel() {
    setExportError(null);
    try {
      await creditDebitApi.exportExcel(activeFilters);
    } catch (error) {
      setExportError(getErrorMessage(error, 'Could not create the Excel file'));
    }
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 0.5 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>Credit / Debit</Typography>
        <Button variant="outlined" startIcon={<DownloadIcon />} onClick={exportExcel} data-testid="cd-export">Download Excel</Button>
      </Box>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Note down money received (credit) and money paid out (debit) against a name, with the date and a note.
      </Typography>

      <Paper sx={{ p: 2, borderRadius: 3, mb: 2 }} data-testid="cd-filters">
        <Grid container spacing={1.5} sx={{ alignItems: 'flex-start' }}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Autocomplete
              freeSolo size="small" options={namesQuery.data ?? []} inputValue={name} onInputChange={(_, v) => setName(v)}
              renderInput={(params) => <TextField {...params} label="Filter by name" slotProps={{ ...params.slotProps, htmlInput: { ...params.slotProps.htmlInput, 'data-testid': 'filter-name', autoComplete: 'off' } }} />}
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <TextField size="small" fullWidth type="date" label="From date" value={from} onChange={(e) => setFrom(e.target.value)}
              error={Boolean(rangeError)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'filter-from' } }} />
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <TextField size="small" fullWidth type="date" label="To date" value={to} onChange={(e) => setTo(e.target.value)}
              error={Boolean(rangeError)} helperText={rangeError || undefined} slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'filter-to' } }} />
          </Grid>
          <Grid size={{ xs: 12, sm: 2 }}>
            <Button fullWidth startIcon={<ClearIcon />} sx={{ height: 40 }} disabled={!name && !from && !to} onClick={() => { setName(''); setFrom(''); setTo(''); }} data-testid="filter-clear">
              Clear
            </Button>
          </Grid>
        </Grid>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mt: 1.5, alignItems: 'center' }} data-testid="cd-summary">
          <Chip label={`Total credit  ₹${money(summary?.credit_total ?? 0)}`} sx={{ bgcolor: '#e8f5e9', color: '#1b5e20', fontWeight: 800 }} data-testid="sum-credit" />
          <Chip label={`Total debit  ₹${money(summary?.debit_total ?? 0)}`} sx={{ bgcolor: '#fdecea', color: '#b71c1c', fontWeight: 800 }} data-testid="sum-debit" />
          <Chip label={`Credit - Debit  ${(summary?.net ?? 0) < 0 ? '-' : ''}₹${money(Math.abs(summary?.net ?? 0))}`} sx={{ fontWeight: 800 }} data-testid="sum-net" />
          <Button size="small" onClick={() => setShowBalances((v) => !v)} data-testid="toggle-balances">{showBalances ? 'Hide' : 'Show'} balance by name</Button>
        </Box>
        {showBalances && (
          <Box sx={{ mt: 1, overflowX: 'auto' }}>
            <Table size="small" data-testid="balance-table">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: '#f3f5fc' } }}>
                  <TableCell>Name</TableCell><TableCell align="right">Credit</TableCell><TableCell align="right">Debit</TableCell><TableCell align="right">Credit - Debit</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(summary?.by_name ?? []).map((p) => (
                  <TableRow key={p.name}>
                    <TableCell sx={{ fontWeight: 600 }}>{p.name}</TableCell>
                    <TableCell align="right">₹{money(p.credit)}</TableCell>
                    <TableCell align="right">₹{money(p.debit)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: p.net < 0 ? '#b71c1c' : '#1b5e20' }}>{p.net < 0 ? '-' : ''}₹{money(Math.abs(p.net))}</TableCell>
                  </TableRow>
                ))}
                {(summary?.by_name ?? []).length === 0 && <TableRow><TableCell colSpan={4} align="center" sx={{ color: 'text.secondary' }}>Nothing to show.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Box>
        )}
        {exportError && <Alert severity="error" sx={{ mt: 1 }} onClose={() => setExportError(null)}>{exportError}</Alert>}
      </Paper>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, xl: 6 }}><Book kind="credit" filters={activeFilters} names={namesQuery.data ?? []} canDelete={canDelete} /></Grid>
        <Grid size={{ xs: 12, xl: 6 }}><Book kind="debit" filters={activeFilters} names={namesQuery.data ?? []} canDelete={canDelete} /></Grid>
      </Grid>
    </Box>
  );
}
