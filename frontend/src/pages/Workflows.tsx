import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Box, Button, Chip, CircularProgress, Grid, IconButton, List, ListItemButton, ListItemText, MenuItem, Paper, Stack,
  TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { workflowApi } from '../api/workflowApi';
import { getErrorMessage } from '../utils/api';
import type { StepKind, TemplateStep, WorkStage } from '../types/workflow';

const STAGES: { value: WorkStage; label: string }[] = [
  { value: 'design', label: 'Design' },
  { value: 'approval', label: 'Proof approval' },
  { value: 'printing', label: 'Printing' },
  { value: 'binding', label: 'Binding / finishing' },
  { value: 'packing', label: 'Packing / handover' },
];
const KINDS: { value: StepKind; label: string }[] = [
  { value: 'internal', label: 'Done in the shop' },
  { value: 'outsource', label: 'Sent to an outside company' },
  { value: 'purchase', label: 'Material to be bought' },
];

/** The steps each service goes through (Design -> Proof -> Printing -> Binding -> Handover ...). Copied onto every new job card. */
export default function Workflows() {
  const queryClient = useQueryClient();
  const templates = useQuery({ queryKey: ['workflow-templates'], queryFn: workflowApi.templates });
  const centers = useQuery({ queryKey: ['work-centers'], queryFn: workflowApi.workCenters });
  const [selected, setSelected] = useState<number | null | undefined>(undefined);
  const [steps, setSteps] = useState<TemplateStep[]>([]);
  const [saved, setSaved] = useState(false);

  const current = templates.data?.find((t) => t.category_id === (selected === undefined ? null : selected));
  useEffect(() => {
    if (current) setSteps(current.steps.map((s) => ({ ...s })));
    setSaved(false);
  }, [current?.category_id, Boolean(current)]); // eslint-disable-line react-hooks/exhaustive-deps

  const store = (data: unknown) => queryClient.setQueryData(['workflow-templates'], data);
  const save = useMutation({
    mutationFn: () => workflowApi.saveTemplate(current?.category_id ?? null, steps),
    onSuccess: (data) => { store(data); setSaved(true); },
  });
  const reset = useMutation({
    mutationFn: () => workflowApi.resetTemplate(current!.category_id as number),
    onSuccess: (data) => {
      store(data);
      const fresh = data.find((t) => t.category_id === (current?.category_id ?? null));
      if (fresh) setSteps(fresh.steps.map((s) => ({ ...s })));
      setSaved(false);
    },
  });

  const update = (i: number, patch: Partial<TemplateStep>) => { setSaved(false); setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s))); };
  const move = (i: number, delta: number) => {
    setSaved(false);
    setSteps((prev) => {
      const next = [...prev];
      const j = i + delta;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };
  const valid = steps.length > 0 && steps.every((s) => s.name.trim());

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 1 }}>Workflows</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Choose a service and set the steps its jobs go through, in order, and which work center does each. Every new job card gets a copy of these steps.
        Jobs already running keep the steps they have.
      </Typography>
      {templates.isLoading ? <CircularProgress /> : (
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Paper sx={{ borderRadius: 2 }}>
              <List dense disablePadding>
                {(templates.data ?? []).map((t) => (
                  <ListItemButton key={t.category_id ?? 'default'} selected={(selected === undefined ? null : selected) === t.category_id} onClick={() => setSelected(t.category_id)}>
                    <ListItemText primary={t.category_name} secondary={t.category_id === null ? 'Used when a service has no workflow of its own' : `${t.steps.length} steps`} />
                    {t.category_id !== null && !t.is_custom && <Chip size="small" label="default" />}
                  </ListItemButton>
                ))}
              </List>
            </Paper>
          </Grid>
          <Grid size={{ xs: 12, md: 8 }}>
            {current && (
              <Paper sx={{ p: 2.5, borderRadius: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>{current.category_name}</Typography>
                {current.category_id !== null && !current.is_custom && (
                  <Alert severity="info" sx={{ mb: 2 }}>This service uses the default workflow. Change and save the steps to give it its own.</Alert>
                )}
                {save.isError && <Alert severity="error" sx={{ mb: 2 }}>{getErrorMessage(save.error, 'Could not save')}</Alert>}
                {saved && <Alert severity="success" sx={{ mb: 2 }}>Saved. New job cards of this service will use these steps.</Alert>}
                <Stack spacing={1.5}>
                  {steps.map((s, i) => (
                    <Paper key={i} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }} data-testid="template-step">
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                        <Typography sx={{ fontWeight: 700, width: 24 }}>{i + 1}</Typography>
                        <TextField size="small" label="Step" value={s.name} onChange={(e) => update(i, { name: e.target.value })} sx={{ flexGrow: 1, minWidth: 160 }} />
                        <IconButton size="small" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUpwardIcon fontSize="small" /></IconButton>
                        <IconButton size="small" aria-label="Move down" disabled={i === steps.length - 1} onClick={() => move(i, 1)}><ArrowDownwardIcon fontSize="small" /></IconButton>
                        <IconButton size="small" aria-label="Remove step" disabled={steps.length === 1} onClick={() => { setSaved(false); setSteps((prev) => prev.filter((_, idx) => idx !== i)); }}><DeleteIcon fontSize="small" /></IconButton>
                      </Stack>
                      <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
                        <Grid size={{ xs: 12, sm: 4 }}>
                          <TextField select size="small" fullWidth label="Work center" value={s.work_center_id ?? ''} onChange={(e) => update(i, { work_center_id: e.target.value === '' ? null : Number(e.target.value) })}>
                            <MenuItem value="">- none -</MenuItem>
                            {(centers.data ?? []).filter((c) => c.is_active || c.id === s.work_center_id).map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                          </TextField>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 4 }}>
                          <TextField select size="small" fullWidth label="Type" value={s.kind} onChange={(e) => update(i, { kind: e.target.value as StepKind })}>
                            {KINDS.map((k) => <MenuItem key={k.value} value={k.value}>{k.label}</MenuItem>)}
                          </TextField>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 4 }}>
                          <TextField select size="small" fullWidth label="Job status while here" value={s.stage} onChange={(e) => update(i, { stage: e.target.value as WorkStage })}>
                            {STAGES.map((k) => <MenuItem key={k.value} value={k.value}>{k.label}</MenuItem>)}
                          </TextField>
                        </Grid>
                      </Grid>
                    </Paper>
                  ))}
                </Stack>
                <Stack direction="row" spacing={1.5} sx={{ mt: 2, flexWrap: 'wrap', rowGap: 1 }}>
                  <Button startIcon={<AddIcon />} onClick={() => { setSaved(false); setSteps((prev) => [...prev, { name: '', kind: 'internal', stage: 'printing', work_center_id: null }]); }}>Add a step</Button>
                  <Box sx={{ flexGrow: 1 }} />
                  {current.category_id !== null && current.is_custom && (
                    <Button color="warning" disabled={reset.isPending} onClick={() => reset.mutate()}>Use the default workflow</Button>
                  )}
                  <Button variant="contained" sx={{ bgcolor: '#1a237e' }} disabled={!valid || save.isPending} onClick={() => save.mutate()}>Save workflow</Button>
                </Stack>
              </Paper>
            )}
            {!current && <Alert severity="info">Pick a service on the left to see and change its steps.</Alert>}
          </Grid>
        </Grid>
      )}
    </Box>
  );
}
