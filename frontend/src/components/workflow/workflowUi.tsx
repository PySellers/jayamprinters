import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Autocomplete, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Grid, MenuItem, Stack,
  TextField, Typography,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckIcon from '@mui/icons-material/Check';
import PauseIcon from '@mui/icons-material/Pause';
import BackHandIcon from '@mui/icons-material/BackHand';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import EditNoteIcon from '@mui/icons-material/EditNote';
import { workflowApi } from '../../api/workflowApi';
import { vendorsApi } from '../../api/vendorsApi';
import { getErrorMessage } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import type { JobStep, StepStatus } from '../../types/workflow';

export const STATUS_LABEL: Record<StepStatus, string> = {
  waiting: 'Waiting',
  ready: 'Ready to start',
  in_progress: 'In progress',
  on_hold: 'On hold',
  done: 'Done',
  skipped: 'Skipped',
};
export const STATUS_COLOR: Record<StepStatus, 'default' | 'info' | 'warning' | 'success' | 'error' | 'primary'> = {
  waiting: 'default',
  ready: 'info',
  in_progress: 'primary',
  on_hold: 'warning',
  done: 'success',
  skipped: 'default',
};
export const PRIORITY_COLOR: Record<string, 'default' | 'info' | 'warning' | 'error'> = { low: 'default', medium: 'info', high: 'warning', urgent: 'error' };

export function StatusChip({ status }: { status: StepStatus }) {
  return <Chip size="small" label={STATUS_LABEL[status]} color={STATUS_COLOR[status]} variant={status === 'waiting' || status === 'skipped' ? 'outlined' : 'filled'} />;
}

export function fmtMinutes(minutes?: number | null): string {
  if (minutes === null || minutes === undefined) return '-';
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 24) return m ? `${h} h ${m} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} d ${h % 24} h`;
}

export function fmtDateTime(value?: string | null): string {
  if (!value) return '-';
  // the server stores UTC without a zone marker
  const d = new Date(value.endsWith('Z') || value.includes('+') ? value : `${value}Z`);
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Start / Done / Hold / Take / Send out buttons for one step, with the small dialogs they need. */
export function StepActionBar({ step, compact = false, onChanged }: { step: JobStep; compact?: boolean; onChanged?: () => void }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [doneOpen, setDoneOpen] = useState(false);
  const [holdOpen, setHoldOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateText, setUpdateText] = useState('');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    ['my-work', 'production-board', 'production-summary', 'job-steps', 'job-timeline', 'job-cards', 'my-work-count'].forEach((key) =>
      queryClient.invalidateQueries({ queryKey: [key] }),
    );
    onChanged?.();
  };
  const run = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => {
      setError(null);
      setDoneOpen(false);
      setHoldOpen(false);
      setUpdateOpen(false);
      setUpdateText('');
      setNote('');
      setReason('');
      refresh();
    },
    onError: (e) => setError(getErrorMessage(e, 'That did not work')),
  });

  if (['done', 'skipped', 'waiting'].includes(step.status)) return null;
  const size = compact ? 'small' : 'medium';
  const mine = step.assigned_to !== null && step.assigned_to !== undefined && String(step.assigned_to) === String(user?.id);
  const isOutside = step.kind === 'outsource';
  const sentOut = Boolean(step.outsource_job_id);

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
        {step.can_act && !step.assigned_to && (
          <Button size={size} variant="outlined" startIcon={<BackHandIcon />} disabled={run.isPending} onClick={() => run.mutate(() => workflowApi.claim(step.id))}>
            Take it
          </Button>
        )}
        {step.can_act && (step.status === 'ready' || step.status === 'on_hold') && !(isOutside && !sentOut) && (
          <Button size={size} variant="contained" color="primary" startIcon={<PlayArrowIcon />} disabled={run.isPending} onClick={() => run.mutate(() => workflowApi.start(step.id))}>
            {step.status === 'on_hold' ? 'Resume' : 'Start'}
          </Button>
        )}
        {step.can_act && isOutside && !sentOut && step.status !== 'waiting' && (
          <Button size={size} variant="contained" startIcon={<LocalShippingIcon />} onClick={() => setSendOpen(true)}>
            Send to outside company
          </Button>
        )}
        {step.can_act && step.status !== 'on_hold' && !(isOutside && !sentOut && step.status === 'ready') && (
          <Button size={size} variant="contained" color="success" startIcon={<CheckIcon />} disabled={run.isPending} onClick={() => { setError(null); setDoneOpen(true); }}>
            {isOutside ? 'Received - done' : 'Done'}
          </Button>
        )}
        {step.can_act && mine && ['in_progress', 'on_hold', 'ready'].includes(step.status) && (
          <Button size={size} variant="outlined" startIcon={<EditNoteIcon />} onClick={() => { setError(null); setUpdateOpen(true); }} data-testid="add-update">
            Add update
          </Button>
        )}
        {step.can_act && step.status !== 'on_hold' && (
          <Button size={size} variant="outlined" color="warning" startIcon={<PauseIcon />} onClick={() => { setError(null); setHoldOpen(true); }}>
            Hold
          </Button>
        )}
      </Stack>
      {mine && step.status === 'ready' && !compact && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>It is waiting for you.</Typography>
      )}
      {error && !doneOpen && !holdOpen && !sendOpen && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}

      <Dialog open={doneOpen} onClose={() => setDoneOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Finish "{step.name}"</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>The job moves on to the next team straight away.</Typography>
          {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}
          <TextField label="Note for the next person (optional)" fullWidth multiline minRows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDoneOpen(false)}>Cancel</Button>
          <Button variant="contained" color="success" disabled={run.isPending} onClick={() => run.mutate(() => workflowApi.complete(step.id, note))}>Mark done</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={updateOpen} onClose={() => setUpdateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Update on "{step.name}"</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Your own progress note. It is saved under your name in the job's trail and in your Work Log.</Typography>
          {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}
          <TextField label="What is done so far?" required fullWidth autoFocus multiline minRows={2} placeholder="e.g. printed 600 of 1000" value={updateText} onChange={(e) => setUpdateText(e.target.value)} slotProps={{ htmlInput: { 'data-testid': 'update-text', maxLength: 500 } }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUpdateOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!updateText.trim() || run.isPending} data-testid="update-save" onClick={() => run.mutate(() => workflowApi.addUpdate(step.id, updateText))}>Save update</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={holdOpen} onClose={() => setHoldOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Put "{step.name}" on hold</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}
          <TextField label="Why is it on hold?" required fullWidth autoFocus placeholder="e.g. waiting for customer matter, paper not in stock" value={reason} onChange={(e) => setReason(e.target.value)} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHoldOpen(false)}>Cancel</Button>
          <Button variant="contained" color="warning" disabled={!reason.trim() || run.isPending} onClick={() => run.mutate(() => workflowApi.hold(step.id, reason))}>Put on hold</Button>
        </DialogActions>
      </Dialog>

      <SendOutDialog open={sendOpen} step={step} onClose={() => setSendOpen(false)} onDone={() => { setSendOpen(false); refresh(); }} />
    </Box>
  );
}

function SendOutDialog({ open, step, onClose, onDone }: { open: boolean; step: JobStep; onClose: () => void; onDone: () => void }) {
  const vendors = useQuery({ queryKey: ['vendors'], queryFn: vendorsApi.list, enabled: open });
  const [company, setCompany] = useState('');
  const [cost, setCost] = useState('');
  const [price, setPrice] = useState('');
  const [expected, setExpected] = useState('');
  const [details, setDetails] = useState('');
  const send = useMutation({
    mutationFn: () => {
      const match = (vendors.data ?? []).find((v) => v.name.toLowerCase() === company.trim().toLowerCase());
      return workflowApi.sendOut(step.id, {
        vendor_id: match?.id ?? null,
        vendor_name: match ? null : company.trim(),
        cost_amount: Number(cost) || 0,
        customer_price: Number(price) || 0,
        expected_date: expected || null,
        description: details.trim() || null,
      });
    },
    onSuccess: onDone,
  });
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Send "{step.name}" to an outside company</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          An Outsource job is created and linked to this step. When it is marked Received the step finishes by itself.
        </Typography>
        {send.isError && <Alert severity="error" sx={{ mb: 1.5 }}>{getErrorMessage(send.error, 'Could not send the job out')}</Alert>}
        <Grid container spacing={2}>
          <Grid size={{ xs: 12 }}>
            <Autocomplete
              freeSolo
              options={(vendors.data ?? []).map((v) => v.name)}
              inputValue={company}
              onInputChange={(_, v) => setCompany(v)}
              renderInput={(params) => <TextField {...params} label="Outside company" required helperText="Pick a vendor or type a new name" />}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField label="Cost (we pay them)" type="number" fullWidth value={cost} onChange={(e) => setCost(e.target.value)} slotProps={{ htmlInput: { step: 'any', min: 0 } }} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField label="Price billed to customer" type="number" fullWidth value={price} onChange={(e) => setPrice(e.target.value)} slotProps={{ htmlInput: { step: 'any', min: 0 } }} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField label="Expected back on" type="date" fullWidth value={expected} onChange={(e) => setExpected(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <TextField label="Details for the outside company" fullWidth multiline minRows={2} value={details} onChange={(e) => setDetails(e.target.value)} />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!company.trim() || send.isPending} onClick={() => send.mutate()}>Send out</Button>
      </DialogActions>
    </Dialog>
  );
}

/** Assign a step to an employee (supervisors) - a small dropdown dialog. */
export function AssignDialog({ step, open, onClose, onDone }: { step: JobStep; open: boolean; onClose: () => void; onDone: () => void }) {
  const staff = useQuery({ queryKey: ['work-staff'], queryFn: workflowApi.staff, enabled: open });
  const [who, setWho] = useState<number | ''>(step.assigned_to ?? '');
  const save = useMutation({ mutationFn: () => workflowApi.assign(step.id, who === '' ? null : who), onSuccess: onDone });
  const people = [...(staff.data ?? [])].sort((a, b) => {
    const am = step.work_center_id && a.work_center_ids.includes(step.work_center_id) ? 0 : 1;
    const bm = step.work_center_id && b.work_center_ids.includes(step.work_center_id) ? 0 : 1;
    return am - bm || a.name.localeCompare(b.name);
  });
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Who does "{step.name}"?</DialogTitle>
      <DialogContent>
        {save.isError && <Alert severity="error" sx={{ mb: 1.5 }}>{getErrorMessage(save.error, 'Could not assign')}</Alert>}
        <TextField select fullWidth label="Employee" value={who} onChange={(e) => setWho(e.target.value === '' ? '' : Number(e.target.value))} sx={{ mt: 1 }} helperText="People in this step's work center are listed first. Leave empty to let anyone in the work center take it.">
          <MenuItem value="">Anyone in {step.work_center_name ?? 'the work center'}</MenuItem>
          {people.map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.name}{step.work_center_id && p.work_center_ids.includes(step.work_center_id) ? ` - ${step.work_center_name}` : ''}
            </MenuItem>
          ))}
        </TextField>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={save.isPending} onClick={() => save.mutate()}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}
