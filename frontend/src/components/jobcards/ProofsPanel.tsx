import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Box, Button, Chip, IconButton, MenuItem, Paper, Stack, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { jobCardsApi } from '../../api/jobCardsApi';
import { workflowApi } from '../../api/workflowApi';
import { getErrorMessage } from '../../utils/api';
import type { JobProof, ProofStatus } from '../../types/jobCards';

const STATUS_OPTIONS: { value: ProofStatus; label: string }[] = [
  { value: 'scheduled', label: 'Not shown yet' },
  { value: 'sent', label: 'Shown to the customer' },
  { value: 'approved', label: 'Approved' },
  { value: 'changes', label: 'Changes asked' },
];
const STATUS_COLOR: Record<ProofStatus, 'default' | 'info' | 'success' | 'warning'> = {
  scheduled: 'default', sent: 'info', approved: 'success', changes: 'warning',
};

const fmtDay = (d?: string | null) => (d ? new Date(`${d}T00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

/**
 * The design proofs of one job: Proof 1, Proof 2 ... as many as the customer needs, each with its due time,
 * status and the person looking after it. The dashboard shows the one to watch for every running job.
 */
export default function ProofsPanel({ jobCardId, canEdit = true }: { jobCardId: number; canEdit?: boolean }) {
  const queryClient = useQueryClient();
  const proofsQuery = useQuery({ queryKey: ['job-proofs', jobCardId], queryFn: () => jobCardsApi.proofs(jobCardId), refetchInterval: 30000 });
  const staffQuery = useQuery({ queryKey: ['workflow-staff'], queryFn: workflowApi.staff, retry: false });
  const [adding, setAdding] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [notes, setNotes] = useState('');
  const [handler, setHandler] = useState<number | ''>('');

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['job-proofs', jobCardId] });
    queryClient.invalidateQueries({ queryKey: ['job-card-detail', jobCardId] });
    queryClient.invalidateQueries({ queryKey: ['job-cards'] });
  };
  const addMutation = useMutation({
    mutationFn: () => jobCardsApi.addProof(jobCardId, { due_date: dueDate || null, due_time: dueTime || null, notes: notes.trim() || null, handled_by: handler === '' ? null : handler }),
    onSuccess: () => { refresh(); setAdding(false); setDueDate(''); setDueTime(''); setNotes(''); setHandler(''); },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof jobCardsApi.updateProof>[1] }) => jobCardsApi.updateProof(id, data),
    onSuccess: refresh,
  });
  const removeMutation = useMutation({ mutationFn: (id: number) => jobCardsApi.removeProof(id), onSuccess: refresh });

  const proofs: JobProof[] = proofsQuery.data ?? [];
  const staff = staffQuery.data ?? [];
  const error = addMutation.error ?? updateMutation.error ?? removeMutation.error;

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }} data-testid="proofs-panel">
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#1a237e' }}>
          Design proofs {proofs.length > 0 && <Typography component="span" color="text.secondary" variant="body2">({proofs.filter((p) => p.status === 'approved').length} of {proofs.length} approved)</Typography>}
        </Typography>
        {canEdit && <Button size="small" startIcon={<AddIcon />} onClick={() => setAdding((v) => !v)} data-testid="add-proof">Add a proof</Button>}
      </Stack>
      {error != null && <Alert severity="error" sx={{ mb: 1 }}>{getErrorMessage(error, 'Could not save the proof')}</Alert>}

      {adding && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5, p: 1.25, bgcolor: '#f3f6ff', borderRadius: 2 }}>
          <TextField size="small" type="date" label="Due date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" type="time" label="Due time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" select label="Looked after by" value={handler} onChange={(e) => setHandler(e.target.value === '' ? '' : Number(e.target.value))} sx={{ minWidth: 170 }}>
            <MenuItem value="">Design team</MenuItem>
            {staff.map((u) => <MenuItem key={u.id} value={u.id}>{u.name}</MenuItem>)}
          </TextField>
          <TextField size="small" label="Note" value={notes} onChange={(e) => setNotes(e.target.value)} sx={{ flexGrow: 1, minWidth: 160 }} />
          <Button variant="contained" size="small" disabled={addMutation.isPending} onClick={() => addMutation.mutate()} data-testid="save-proof">Add proof</Button>
        </Box>
      )}

      {proofs.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No proofs planned yet.</Typography>
      ) : (
        <Stack spacing={1}>
          {proofs.map((p) => (
            <Box
              key={p.id}
              data-testid="proof-row"
              sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap', p: 1, borderRadius: 1.5, border: '1px solid', borderColor: p.overdue ? '#ef9a9a' : '#e3e6f2', bgcolor: p.overdue ? '#fff4f4' : 'transparent' }}
            >
              <Typography sx={{ fontWeight: 800, minWidth: 64 }}>{p.label}</Typography>
              <Typography variant="body2" color={p.overdue ? 'error' : 'text.secondary'} sx={{ minWidth: 150, fontWeight: p.overdue ? 700 : 400 }}>
                {p.due_date ? `${fmtDay(p.due_date)} ${p.due_time ?? ''}` : 'No time set'}{p.overdue ? ' (late)' : ''}
              </Typography>
              {canEdit ? (
                <TextField
                  select size="small" value={p.status} sx={{ minWidth: 190 }}
                  onChange={(e) => updateMutation.mutate({ id: p.id, data: { status: e.target.value as ProofStatus } })}
                  slotProps={{ htmlInput: { 'data-testid': 'proof-status' } }}
                >
                  {STATUS_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                </TextField>
              ) : (
                <Chip size="small" color={STATUS_COLOR[p.status]} label={p.status_label} />
              )}
              {canEdit ? (
                <TextField
                  select size="small" value={p.handled_by ?? ''} sx={{ minWidth: 160 }} label="Looked after by"
                  onChange={(e) => updateMutation.mutate({ id: p.id, data: { handled_by: e.target.value === '' ? null : Number(e.target.value) } })}
                >
                  <MenuItem value="">Design team</MenuItem>
                  {staff.map((u) => <MenuItem key={u.id} value={u.id}>{u.name}</MenuItem>)}
                </TextField>
              ) : (
                <Typography variant="body2" color="text.secondary">{p.handled_by_name ?? 'Design team'}</Typography>
              )}
              {p.notes && <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1 }}>{p.notes}</Typography>}
              {canEdit && (
                <IconButton size="small" aria-label="Remove proof" sx={{ ml: 'auto' }} onClick={() => removeMutation.mutate(p.id)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              )}
            </Box>
          ))}
        </Stack>
      )}
    </Paper>
  );
}
