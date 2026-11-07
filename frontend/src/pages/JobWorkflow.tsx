import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Grid, IconButton,
  LinearProgress, Menu, MenuItem, Paper, Stack, TextField, Typography,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DescriptionIcon from '@mui/icons-material/Description';
import { workflowApi } from '../api/workflowApi';
import { jobCardsApi } from '../api/jobCardsApi';
import { customersApi } from '../api/customersApi';
import { productsApi } from '../api/productsApi';
import { getErrorMessage } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { AssignDialog, PRIORITY_COLOR, StatusChip, StepActionBar, fmtDateTime, fmtMinutes } from '../components/workflow/workflowUi';
import type { JobStep } from '../types/workflow';

const ACTION_TEXT: Record<string, string> = {
  created: 'Workflow planned',
  started: 'Started',
  resumed: 'Resumed',
  completed: 'Finished',
  handoff: 'Handed over',
  delivered: 'Delivered',
  on_hold: 'Put on hold',
  reopened: 'Re-opened',
  skipped: 'Skipped',
  assigned: 'Assigned',
  unassigned: 'Unassigned',
  edited: 'Edited',
  moved: 'Re-ordered',
  step_added: 'Step added',
  step_removed: 'Step removed',
  sent_out: 'Sent to outside company',
  status_set: 'Status changed',
};

function StepRow({ step, isLast, isManager, onChanged }: { step: JobStep; isLast: boolean; isManager: boolean; onChanged: () => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState(step.name);
  const [due, setDue] = useState(step.due_date ?? '');
  const [notes, setNotes] = useState(step.notes ?? '');
  const [centerId, setCenterId] = useState<number | ''>(step.work_center_id ?? '');
  const [error, setError] = useState<string | null>(null);
  const centers = useQuery({ queryKey: ['work-centers'], queryFn: workflowApi.workCenters, enabled: editOpen });

  const run = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => { setError(null); setEditOpen(false); onChanged(); },
    onError: (e) => setError(getErrorMessage(e, 'That did not work')),
  });
  const act = (fn: () => Promise<unknown>) => { setAnchor(null); run.mutate(fn); };
  const finished = step.status === 'done' || step.status === 'skipped';
  const dot = step.status === 'done' ? '#2e7d32' : step.status === 'skipped' ? '#9e9e9e' : step.status === 'waiting' ? '#bdbdbd' : step.status === 'on_hold' ? '#ef6c00' : '#1a237e';

  return (
    <Stack direction="row" spacing={2} data-testid="step-row" data-status={step.status}>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Box sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: dot, color: 'white', display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 700 }}>
          {step.status === 'done' ? '✓' : step.position}
        </Box>
        {!isLast && <Box sx={{ flexGrow: 1, width: 2, bgcolor: finished ? '#a5d6a7' : '#e0e0e0', my: 0.5 }} />}
      </Box>
      <Paper variant="outlined" sx={{ flexGrow: 1, p: 2, mb: 2, borderRadius: 2, opacity: step.status === 'skipped' ? 0.6 : 1, borderColor: step.status === 'in_progress' ? '#1a237e' : undefined }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{step.name}</Typography>
            <Stack direction="row" spacing={0.75} sx={{ mt: 0.5, flexWrap: 'wrap', rowGap: 0.75, alignItems: 'center' }}>
              <StatusChip status={step.status} />
              {step.work_center_name && <Chip size="small" variant="outlined" label={step.work_center_name} sx={{ borderColor: step.work_center_color || undefined }} />}
              {step.kind === 'outsource' && <Chip size="small" color="info" variant="outlined" label="Outside company" />}
              <Chip size="small" variant="outlined" label={step.assigned_to_name ? `On: ${step.assigned_to_name}` : 'Not assigned'} />
              {step.due_date && <Chip size="small" variant="outlined" label={`Due ${step.due_date}`} />}
            </Stack>
          </Box>
          {isManager && (
            <>
              <IconButton size="small" aria-label="Step options" onClick={(e) => setAnchor(e.currentTarget)}><MoreVertIcon /></IconButton>
              <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
                {!finished && <MenuItem onClick={() => { setAnchor(null); setAssignOpen(true); }}>Assign to...</MenuItem>}
                {!finished && <MenuItem onClick={() => { setAnchor(null); setName(step.name); setDue(step.due_date ?? ''); setNotes(step.notes ?? ''); setCenterId(step.work_center_id ?? ''); setEditOpen(true); }}>Edit step</MenuItem>}
                {!finished && <MenuItem onClick={() => act(() => workflowApi.move(step.id, 'up'))}>Move up</MenuItem>}
                {!finished && <MenuItem onClick={() => act(() => workflowApi.move(step.id, 'down'))}>Move down</MenuItem>}
                {!finished && <MenuItem onClick={() => act(() => workflowApi.skip(step.id, 'Not needed for this job'))}>Skip this step</MenuItem>}
                {finished && <MenuItem onClick={() => act(() => workflowApi.reopen(step.id, 'Re-opened'))}>Re-open</MenuItem>}
                {(step.status === 'waiting' || step.status === 'ready') && <MenuItem sx={{ color: 'error.main' }} onClick={() => act(() => workflowApi.removeStep(step.id))}>Delete step</MenuItem>}
              </Menu>
            </>
          )}
        </Stack>

        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {step.status === 'done' && <>Finished{step.completed_by_name ? ` by ${step.completed_by_name}` : ""} · {fmtDateTime(step.completed_at)}{step.minutes_taken !== null && step.minutes_taken !== undefined ? ` · took ${fmtMinutes(step.minutes_taken)}` : ""}</>}
          {step.status === 'in_progress' && <>Started by {step.started_by_name ?? '-'} · {fmtDateTime(step.started_at)} · running {fmtMinutes(step.minutes_taken)}</>}
          {step.status === 'ready' && <>Ready since {fmtDateTime(step.ready_at)}{step.minutes_waiting ? ` · waiting ${fmtMinutes(step.minutes_waiting)}` : ''}</>}
          {step.status === 'waiting' && <>Starts when the step before it is finished.</>}
          {step.status === 'skipped' && <>Skipped</>}
        </Typography>
        {step.hold_reason && <Typography variant="body2" sx={{ mt: 0.5, color: 'warning.dark' }}>On hold: {step.hold_reason}</Typography>}
        {step.notes && <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>Note: {step.notes}</Typography>}
        {step.outsource_job_id && (
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            Outsource {step.outsource_job_number} · {step.outsource_vendor ?? 'outside company'}{step.outsource_expected_date ? ` · back by ${step.outsource_expected_date}` : ''}
          </Typography>
        )}
        {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
        <Box sx={{ mt: 1.5 }}><StepActionBar step={step} onChanged={onChanged} /></Box>
      </Paper>

      <AssignDialog step={step} open={assignOpen} onClose={() => setAssignOpen(false)} onDone={() => { setAssignOpen(false); onChanged(); }} />
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Edit step</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Step name" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
            <TextField select label="Work center" value={centerId} onChange={(e) => setCenterId(e.target.value === '' ? '' : Number(e.target.value))} fullWidth>
              <MenuItem value="">- none -</MenuItem>
              {(centers.data ?? []).filter((c) => c.is_active).map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </TextField>
            <TextField label="Due date" type="date" value={due} onChange={(e) => setDue(e.target.value)} fullWidth slotProps={{ inputLabel: { shrink: true } }} />
            <TextField label="Note" value={notes} onChange={(e) => setNotes(e.target.value)} fullWidth multiline minRows={2} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!name.trim() || run.isPending}
            onClick={() => run.mutate(() => workflowApi.editStep(step.id, { name, work_center_id: centerId === '' ? null : centerId, due_date: due || null, notes: notes || null }))}>Save</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

/** One order's journey: every step with who did it and when, a hand-over trail, and the supervisor's controls. */
export default function JobWorkflow() {
  const { id } = useParams();
  const jobId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isManager = user?.role === 'admin' || user?.role === 'counter';
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCenter, setNewCenter] = useState<number | ''>('');
  const [newKind, setNewKind] = useState('internal');
  const [addError, setAddError] = useState<string | null>(null);

  const job = useQuery({ queryKey: ['job-cards', jobId], queryFn: () => jobCardsApi.get(jobId) });
  const steps = useQuery({ queryKey: ['job-steps', jobId], queryFn: () => workflowApi.steps(jobId) });
  const timeline = useQuery({ queryKey: ['job-timeline', jobId], queryFn: () => workflowApi.timeline(jobId) });
  const customers = useQuery({ queryKey: ['customers'], queryFn: customersApi.list });
  const products = useQuery({ queryKey: ['products'], queryFn: productsApi.list });
  const centers = useQuery({ queryKey: ['work-centers'], queryFn: workflowApi.workCenters, enabled: addOpen });

  const refresh = () => {
    ['job-steps', 'job-timeline', 'job-cards', 'my-work', 'production-board', 'production-summary', 'my-work-count'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
  };
  const add = useMutation({
    mutationFn: () => workflowApi.addStep(jobId, { name: newName, work_center_id: newCenter === '' ? null : newCenter, kind: newKind }),
    onSuccess: () => { setAddOpen(false); setNewName(''); setNewCenter(''); setNewKind('internal'); setAddError(null); refresh(); },
    onError: (e) => setAddError(getErrorMessage(e, 'Could not add the step')),
  });

  const j = job.data;
  const customerName = customers.data?.find((c) => c.id === j?.customer_id)?.name ?? '-';
  const productName = products.data?.find((p) => p.id === j?.product_id)?.name ?? '-';
  const list = steps.data ?? [];
  const done = list.filter((s) => s.status === 'done').length;
  const total = list.filter((s) => s.status !== 'skipped').length;

  if (job.isLoading) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;
  if (job.isError || !j) return <Box sx={{ p: 3 }}><Alert severity="error">Job card not found.</Alert></Box>;

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/job-cards')} sx={{ mb: 1 }}>All job cards</Button>
      <Paper sx={{ p: 2.5, borderRadius: 2, mb: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} sx={{ justifyContent: 'space-between', gap: 2 }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>{j.job_number}</Typography>
            <Typography color="text.secondary">{customerName} · {productName}</Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', rowGap: 1 }}>
              <Chip size="small" label={j.status} color={j.status === 'delivered' ? 'success' : 'primary'} />
              <Chip size="small" label={j.priority} color={PRIORITY_COLOR[j.priority]} />
              {j.delivery_date && <Chip size="small" color={j.overdue ? 'error' : 'default'} variant={j.overdue ? 'filled' : 'outlined'} label={`${j.overdue ? 'Overdue · ' : 'Due '}${j.delivery_date}`} />}
            </Stack>
          </Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', flexWrap: 'wrap', rowGap: 1 }}>
            <Button variant="outlined" startIcon={<DescriptionIcon />} onClick={() => navigate(`/job-cards/${jobId}`)}>Paper job card</Button>
          </Stack>
        </Stack>
        <Stack direction="row" sx={{ mt: 2, alignItems: 'center', gap: 1.5 }}>
          <LinearProgress variant="determinate" value={total ? (done / total) * 100 : 0} sx={{ flexGrow: 1, height: 10, borderRadius: 5 }} />
          <Typography sx={{ fontWeight: 700 }}>{done} of {total} steps done</Typography>
        </Stack>
      </Paper>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Steps</Typography>
            {isManager && j.status !== 'delivered' && (
              <Button size="small" startIcon={<AddIcon />} onClick={() => { setAddError(null); setAddOpen(true); }}>Add a step</Button>
            )}
          </Stack>
          {steps.isLoading && <CircularProgress />}
          {steps.isError && <Alert severity="error">Could not load the steps.</Alert>}
          {list.map((s, i) => <StepRow key={s.id} step={s} isLast={i === list.length - 1} isManager={isManager} onChanged={refresh} />)}
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Activity</Typography>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }} data-testid="timeline">
            {(timeline.data ?? []).length === 0 && <Typography color="text.secondary">Nothing has happened yet.</Typography>}
            {[...(timeline.data ?? [])].reverse().map((e, i, arr) => (
              <Box key={e.id}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{ACTION_TEXT[e.action] ?? e.action}{e.step_name ? ` · ${e.step_name}` : ''}</Typography>
                {e.detail && e.detail !== e.step_name && <Typography variant="body2" color="text.secondary">{e.detail}</Typography>}
                <Typography variant="caption" color="text.secondary">{e.user_name ?? 'System'} · {fmtDateTime(e.created_at)}</Typography>
                {i < arr.length - 1 && <Divider sx={{ my: 1 }} />}
              </Box>
            ))}
          </Paper>
        </Grid>
      </Grid>

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add a step to this job</DialogTitle>
        <DialogContent>
          {addError && <Alert severity="error" sx={{ mb: 1.5 }}>{addError}</Alert>}
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Step name" required autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Foil stamping (outside)" fullWidth />
            <TextField select label="Done by (work center)" value={newCenter} onChange={(e) => setNewCenter(e.target.value === '' ? '' : Number(e.target.value))} fullWidth>
              <MenuItem value="">- none -</MenuItem>
              {(centers.data ?? []).filter((c) => c.is_active).map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </TextField>
            <TextField select label="Type" value={newKind} onChange={(e) => setNewKind(e.target.value)} fullWidth>
              <MenuItem value="internal">Done in the shop</MenuItem>
              <MenuItem value="outsource">Sent to an outside company</MenuItem>
              <MenuItem value="purchase">Material to be bought</MenuItem>
            </TextField>
            <Typography variant="caption" color="text.secondary">The new step goes in before the final hand-over step.</Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!newName.trim() || add.isPending} onClick={() => add.mutate()}>Add step</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
