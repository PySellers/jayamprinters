import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Stack, TextField, Typography,
} from '@mui/material';
import AddTaskIcon from '@mui/icons-material/AddTask';
import PersonAddAltIcon from '@mui/icons-material/PersonAddAlt';
import { workflowApi } from '../../api/workflowApi';
import { getErrorMessage } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { AssignDialog, StatusChip, StepActionBar } from '../workflow/workflowUi';
import type { JobStep } from '../../types/workflow';

const OPEN = ['ready', 'in_progress', 'on_hold'];

/**
 * The tasks (steps) of one job on the job card: who has each one, take it / assign it, and add a task of your own
 * anywhere in the order. Everything shows up on the Live Jobs board against the person and section.
 */
export default function JobTasksPanel({ jobCardId, delivered }: { jobCardId: number; delivered: boolean }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isManager = user?.role === 'admin' || user?.role === 'counter';
  const stepsQuery = useQuery({ queryKey: ['job-steps', jobCardId], queryFn: () => workflowApi.steps(jobCardId), refetchInterval: 20000 });
  const steps = stepsQuery.data ?? [];

  const [assigning, setAssigning] = useState<JobStep | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [centerId, setCenterId] = useState<number | ''>('');
  const [afterId, setAfterId] = useState<number | ''>('');
  const [kind, setKind] = useState('internal');
  const [who, setWho] = useState<number | ''>('');
  const [error, setError] = useState<string | null>(null);

  const centers = useQuery({ queryKey: ['work-centers'], queryFn: workflowApi.workCenters, enabled: addOpen });
  const staff = useQuery({ queryKey: ['work-staff'], queryFn: workflowApi.staff, enabled: addOpen && isManager });

  const refresh = () => {
    ['job-steps', 'job-timeline', 'job-card-detail', 'job-cards', 'my-work', 'production-board', 'production-summary', 'my-work-count'].forEach((k) =>
      queryClient.invalidateQueries({ queryKey: [k] }),
    );
  };

  const holdsOpenStep = steps.some((s) => String(s.assigned_to) === String(user?.id) && OPEN.includes(s.status));
  const canAdd = !delivered && (isManager || holdsOpenStep);

  // a task can go after any step that is not followed by a finished one
  const anchors = steps.filter((_, i) => {
    const next = steps[i + 1];
    return !(next && (next.status === 'done' || next.status === 'skipped'));
  });

  const add = useMutation({
    mutationFn: () => workflowApi.addStep(jobCardId, {
      name: name.trim(),
      work_center_id: centerId === '' ? null : centerId,
      kind,
      after_step_id: afterId === '' ? null : afterId,
      assigned_to: isManager && who !== '' ? who : null,
    }),
    onSuccess: () => {
      setAddOpen(false); setName(''); setCenterId(''); setAfterId(''); setKind('internal'); setWho(''); setError(null);
      refresh();
    },
    onError: (e) => setError(getErrorMessage(e, 'Could not add the task')),
  });

  const claim = useMutation({
    mutationFn: (id: number) => workflowApi.claim(id),
    onSuccess: refresh,
    onError: (e) => setError(getErrorMessage(e, 'Could not take the task')),
  });

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }} data-testid="job-tasks">
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#1a237e', flexGrow: 1 }}>Tasks &amp; who is working on them</Typography>
        {canAdd && (
          <Button size="small" variant="outlined" startIcon={<AddTaskIcon />} onClick={() => { setError(null); setAddOpen(true); }} data-testid="add-task">
            Add a task
          </Button>
        )}
      </Stack>
      {error && !addOpen && <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError(null)}>{error}</Alert>}
      {stepsQuery.isLoading && <CircularProgress size={22} />}
      {stepsQuery.isError && <Alert severity="error">Could not load the tasks.</Alert>}

      <Stack spacing={0.75}>
        {steps.map((s) => {
          const finished = s.status === 'done' || s.status === 'skipped';
          const mine = String(s.assigned_to) === String(user?.id);
          return (
            <Box
              key={s.id}
              data-testid="task-row"
              data-status={s.status}
              sx={{
                display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, px: 1.25, py: 0.75, borderRadius: 1.5,
                border: '1px solid', borderColor: s.status === 'in_progress' ? '#1a237e' : '#e3e6f2',
                bgcolor: s.status === 'in_progress' ? '#f3f5ff' : finished ? '#fafafa' : '#fff', opacity: s.status === 'skipped' ? 0.6 : 1,
              }}
            >
              <Box sx={{ width: 24, height: 24, borderRadius: '50%', bgcolor: s.status === 'done' ? '#2e7d32' : finished ? '#9e9e9e' : s.status === 'waiting' ? '#bdbdbd' : '#1a237e', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                {s.status === 'done' ? '✓' : s.position}
              </Box>
              <Typography sx={{ fontWeight: 700, minWidth: 130 }}>{s.name}</Typography>
              <StatusChip status={s.status} />
              {s.work_center_name && <Chip size="small" variant="outlined" label={s.work_center_name} sx={{ borderColor: s.work_center_color || undefined }} />}
              <Typography variant="body2" sx={{ fontWeight: s.assigned_to_name ? 700 : 400, color: s.assigned_to_name ? '#1a237e' : 'text.secondary' }} data-testid="task-person">
                {s.assigned_to_name ? `On: ${s.assigned_to_name}${mine ? ' (you)' : ''}` : finished ? (s.completed_by_name ? `Done by ${s.completed_by_name}` : '') : 'Not taken yet'}
              </Typography>
              <Box sx={{ flexGrow: 1 }} />
              {!finished && !isManager && !s.assigned_to && s.can_act && s.status !== 'waiting' && (
                <Button size="small" variant="contained" color="secondary" startIcon={<PersonAddAltIcon />} disabled={claim.isPending} onClick={() => claim.mutate(s.id)} data-testid="take-task">
                  Take it
                </Button>
              )}
              {!finished && isManager && (
                <Button size="small" variant="outlined" onClick={() => setAssigning(s)} data-testid="assign-task">
                  {s.assigned_to ? 'Re-assign' : 'Assign'}
                </Button>
              )}
              {!finished && s.status !== 'waiting' && mine && <StepActionBar step={s} compact onChanged={refresh} />}
              {!finished && s.status !== 'waiting' && !mine && isManager && <StepActionBar step={s} compact onChanged={refresh} />}
            </Box>
          );
        })}
        {!stepsQuery.isLoading && steps.length === 0 && <Typography variant="body2" color="text.secondary">No tasks planned for this job.</Typography>}
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        {isManager ? 'Assign a task to a person, or let an employee take it. ' : 'Press “Take it” on the task you will do; it is then yours. '}
        The person and section show on the Live Jobs board.
      </Typography>

      {assigning && (
        <AssignDialog step={assigning} open onClose={() => setAssigning(null)} onDone={() => { setAssigning(null); refresh(); }} />
      )}

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add a task to this job</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Task" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Foil stamping, Pack in boxes" fullWidth slotProps={{ htmlInput: { 'data-testid': 'task-name' } }} />
            <TextField select label="Comes after" value={afterId} onChange={(e) => setAfterId(e.target.value === '' ? '' : Number(e.target.value))} fullWidth helperText="It is placed in the order of the other tasks.">
              <MenuItem value="">Before the final hand-over (default)</MenuItem>
              {anchors.map((s) => <MenuItem key={s.id} value={s.id}>After: {s.position}. {s.name}</MenuItem>)}
            </TextField>
            <TextField select label="Done by (section)" value={centerId} onChange={(e) => setCenterId(e.target.value === '' ? '' : Number(e.target.value))} fullWidth>
              <MenuItem value="">- none -</MenuItem>
              {(centers.data ?? []).filter((c) => c.is_active).map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </TextField>
            {isManager && (
              <TextField select label="Give it to (optional)" value={who} onChange={(e) => setWho(e.target.value === '' ? '' : Number(e.target.value))} fullWidth>
                <MenuItem value="">Anyone in the section</MenuItem>
                {(staff.data ?? []).map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
              </TextField>
            )}
            <TextField select label="Type" value={kind} onChange={(e) => setKind(e.target.value)} fullWidth>
              <MenuItem value="internal">Done in the shop</MenuItem>
              <MenuItem value="outsource">Sent to an outside company</MenuItem>
              <MenuItem value="purchase">Material to be bought</MenuItem>
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!name.trim() || add.isPending} onClick={() => add.mutate()} data-testid="task-add-confirm">Add task</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
