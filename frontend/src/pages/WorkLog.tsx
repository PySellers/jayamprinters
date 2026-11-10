import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, CircularProgress, Link, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import { workflowApi } from '../api/workflowApi';
import { useAuth } from '../context/AuthContext';
import { fmtMinutes } from '../components/workflow/workflowUi';
import type { WorkLog as WorkLogData, WorkLogTeam } from '../types/workflow';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dmy = (s?: string | null) => (s ? s.split('-').reverse().join('-') : '');
type Preset = 'today' | 'week' | 'month' | 'custom';

function range(preset: Preset): { start: string; end: string } {
  const now = new Date();
  const end = iso(now);
  if (preset === 'today') return { start: end, end };
  if (preset === 'week') { const s = new Date(now); s.setDate(s.getDate() - 6); return { start: iso(s), end }; }
  return { start: iso(new Date(now.getFullYear(), now.getMonth(), 1)), end };
}

const PART_LABEL: Record<string, string> = { finished: 'Finished it', started: 'Started it', taken: 'Took it' };

/**
 * One person's work, taken out on its own: every task they took, started or finished in the period, with the times, how long
 * it took and the progress updates they wrote - and, for the Admin and Counter, the whole team at a glance with a click on a
 * name to pull out just that person. Employees see their own work only. Download to Excel.
 */
export default function WorkLog() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const manager = user?.role === 'admin' || user?.role === 'counter';
  const [preset, setPreset] = useState<Preset>('week');
  const initial = range('week');
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [person, setPerson] = useState<number | null>(manager ? null : (user ? Number(user.id) : null));
  const [state, setState] = useState<'all' | 'done' | 'open'>('all');

  const choose = (p: Preset) => {
    setPreset(p);
    if (p !== 'custom') { const r = range(p); setStart(r.start); setEnd(r.end); }
  };
  const team = useQuery({ queryKey: ['work-log-team', start, end], queryFn: () => workflowApi.workLog({ start, end }) as Promise<WorkLogTeam>, enabled: manager && start <= end });
  const log = useQuery({
    queryKey: ['work-log', person, start, end, state],
    queryFn: () => workflowApi.workLog({ person_id: person!, start, end, state }) as Promise<WorkLogData>,
    enabled: person != null && start <= end,
  });
  const data = log.data;
  const s = data?.summary;

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }} data-testid="work-log">
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>Work Log</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {manager ? 'Pick an employee to take out only their work.' : 'Everything you took, started and finished, with the updates you wrote.'}
      </Typography>

      <Paper sx={{ p: 2, borderRadius: 2, mb: 2 }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1.5 }}>
          {manager && (
            <TextField
              select size="small" label="Employee" value={person ?? ''} onChange={(e) => setPerson(e.target.value === '' ? null : Number(e.target.value))} sx={{ minWidth: 220 }}
              slotProps={{ htmlInput: { 'data-testid': 'wl-person' } }}
            >
              <MenuItem value="">Everyone (summary)</MenuItem>
              {(team.data?.team ?? []).map((t) => <MenuItem key={t.id} value={t.id}>{t.name} ({t.finished} done)</MenuItem>)}
            </TextField>
          )}
          <ToggleButtonGroup size="small" exclusive value={preset} onChange={(_, v) => v && choose(v)}>
            <ToggleButton value="today">Today</ToggleButton>
            <ToggleButton value="week">Last 7 days</ToggleButton>
            <ToggleButton value="month">This month</ToggleButton>
            <ToggleButton value="custom">Custom</ToggleButton>
          </ToggleButtonGroup>
          <TextField size="small" type="date" label="From" value={start} onChange={(e) => { setPreset('custom'); setStart(e.target.value); }} slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'wl-from' } }} />
          <TextField size="small" type="date" label="To" value={end} onChange={(e) => { setPreset('custom'); setEnd(e.target.value); }} slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'wl-to' } }} />
          {person != null && (
            <>
              <ToggleButtonGroup size="small" exclusive value={state} onChange={(_, v) => v && setState(v)}>
                <ToggleButton value="all">All</ToggleButton>
                <ToggleButton value="done">Finished</ToggleButton>
                <ToggleButton value="open">Still open</ToggleButton>
              </ToggleButtonGroup>
              <Button variant="outlined" startIcon={<DownloadIcon />} disabled={!data} onClick={() => workflowApi.downloadWorkLog({ person_id: person, start, end, state })} data-testid="wl-excel">Excel</Button>
            </>
          )}
        </Stack>
      </Paper>

      {manager && person == null && (
        <Paper sx={{ borderRadius: 2 }} data-testid="wl-team">
          {team.isLoading ? <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box> : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ '& th': { fontWeight: 700 } }}>
                    <TableCell>Employee</TableCell><TableCell align="right">Finished</TableCell><TableCell align="right">In progress</TableCell>
                    <TableCell align="right">On hold</TableCell><TableCell align="right">Waiting</TableCell><TableCell align="right">Time on finished</TableCell>
                    <TableCell align="right">Average</TableCell><TableCell align="right">Updates</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(team.data?.team ?? []).map((t) => (
                    <TableRow key={t.id} hover sx={{ cursor: 'pointer' }} onClick={() => setPerson(t.id)} data-testid="wl-team-row">
                      <TableCell><Link component="button" type="button" sx={{ fontWeight: 700 }}>{t.name}</Link> <Typography component="span" variant="caption" color="text.secondary">{t.role}</Typography></TableCell>
                      <TableCell align="right"><b>{t.finished}</b></TableCell><TableCell align="right">{t.in_progress}</TableCell>
                      <TableCell align="right">{t.on_hold}</TableCell><TableCell align="right">{t.waiting_to_start}</TableCell>
                      <TableCell align="right">{fmtMinutes(t.total_minutes)}</TableCell><TableCell align="right">{fmtMinutes(t.average_minutes)}</TableCell>
                      <TableCell align="right">{t.updates}</TableCell>
                    </TableRow>
                  ))}
                  {(team.data?.team ?? []).length === 0 && (
                    <TableRow><TableCell colSpan={8} align="center" sx={{ color: 'text.secondary', py: 4 }}>Nobody has worked on a task in this period.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      )}

      {person != null && (
        <>
          {log.isLoading && <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>}
          {log.isError && <Alert severity="error">Could not load the work log.</Alert>}
          {data && s && (
            <>
              <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', rowGap: 1.5, mb: 2, alignItems: 'center' }} data-testid="wl-summary">
                <Typography variant="h6" sx={{ fontWeight: 800, mr: 1 }} data-testid="wl-name">{data.person?.name}</Typography>
                <Chip color="success" label={`${s.finished} finished`} />
                <Chip color="primary" variant="outlined" label={`${s.in_progress} in progress`} />
                <Chip color="warning" variant="outlined" label={`${s.on_hold} on hold`} />
                <Chip variant="outlined" label={`${s.jobs} jobs`} />
                <Chip variant="outlined" label={`Time on finished tasks: ${fmtMinutes(s.total_minutes)}`} />
                {s.average_minutes != null && <Chip variant="outlined" label={`Average ${fmtMinutes(s.average_minutes)}`} />}
                {manager && <Button size="small" onClick={() => setPerson(null)}>Back to everyone</Button>}
              </Stack>
              <Paper sx={{ borderRadius: 2 }}>
                <TableContainer>
                  <Table size="small" data-testid="wl-table">
                    <TableHead>
                      <TableRow sx={{ '& th': { fontWeight: 700 } }}>
                        <TableCell>Date</TableCell><TableCell>Job</TableCell><TableCell>Customer / item</TableCell><TableCell>Task</TableCell>
                        <TableCell>Did</TableCell><TableCell>Status</TableCell><TableCell>Started</TableCell><TableCell>Finished</TableCell>
                        <TableCell align="right">Took</TableCell><TableCell>Notes and updates</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.rows.map((r) => (
                        <TableRow key={r.step_id} hover data-testid="wl-row">
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>{dmy(r.date)}</TableCell>
                          <TableCell><Link component="button" type="button" onClick={() => navigate(`/job-cards/${r.job_card_id}/track`)}>{r.job_number}</Link></TableCell>
                          <TableCell>{r.customer}<Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{r.item}</Typography></TableCell>
                          <TableCell>{r.step}<Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{r.section}</Typography></TableCell>
                          <TableCell>{PART_LABEL[r.part] ?? r.part}</TableCell>
                          <TableCell><Chip size="small" label={r.status_label} color={r.status === 'done' ? 'success' : r.status === 'on_hold' ? 'warning' : r.status === 'in_progress' ? 'primary' : 'default'} variant={r.status === 'done' ? 'filled' : 'outlined'} /></TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>{r.started || '-'}</TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>{r.finished || '-'}</TableCell>
                          <TableCell align="right">{fmtMinutes(r.minutes)}</TableCell>
                          <TableCell sx={{ maxWidth: 320 }}>
                            {r.note && <Typography variant="body2">{r.note}</Typography>}
                            {r.hold_reason && <Typography variant="body2" color="warning.main">On hold: {r.hold_reason}</Typography>}
                            {r.updates.map((u, i) => <Typography key={i} variant="caption" sx={{ display: 'block' }}><b>{u.at}</b> {u.text}</Typography>)}
                          </TableCell>
                        </TableRow>
                      ))}
                      {data.rows.length === 0 && (
                        <TableRow><TableCell colSpan={10} align="center" sx={{ color: 'text.secondary', py: 4 }}>No work in this period.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            </>
          )}
        </>
      )}
    </Box>
  );
}
