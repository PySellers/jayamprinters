import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Alert, Box, Button, Chip, CircularProgress, FormControlLabel, Grid, Paper, Stack, Switch, Tab, Table, TableBody, TableCell,
  TableHead, TableRow, Tabs, Typography,
} from '@mui/material';
import { workflowApi } from '../api/workflowApi';
import WorkCardView from '../components/workflow/WorkCardView';
import { fmtMinutes } from '../components/workflow/workflowUi';
import { useAuth } from '../context/AuthContext';
import type { ProductionSummary } from '../types/workflow';

const CARD_LIMIT = 25; // a column shows its most urgent jobs first; the rest are one click away

function Tile({ label, value, color, hint }: { label: string; value: number | string; color: string; hint?: string }) {
  return (
    <Paper sx={{ p: 2, borderRadius: 2, height: '100%' }} data-testid="monitor-tile">
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="h4" sx={{ fontWeight: 800, color }}>{value}</Typography>
      {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
    </Paper>
  );
}

function Monitor({ data }: { data: ProductionSummary }) {
  const navigate = useNavigate();
  const maxDone = Math.max(1, ...data.trend.map((t) => t.steps_done));
  return (
    <Stack spacing={3}>
      <Grid container spacing={2}>
        <Grid size={{ xs: 6, md: 2 }}><Tile label="Orders in production" value={data.open_jobs} color="#1a237e" /></Grid>
        <Grid size={{ xs: 6, md: 2 }}><Tile label="Overdue" value={data.overdue_jobs} color={data.overdue_jobs ? '#c62828' : '#2e7d32'} hint="past the delivery date" /></Grid>
        <Grid size={{ xs: 6, md: 2 }}><Tile label="Due today" value={data.due_today} color="#ef6c00" /></Grid>
        <Grid size={{ xs: 6, md: 2 }}><Tile label="Urgent / high" value={data.urgent_jobs} color="#6a1b9a" /></Grid>
        <Grid size={{ xs: 6, md: 2 }}><Tile label="On hold" value={data.on_hold_steps} color={data.on_hold_steps ? '#ef6c00' : '#2e7d32'} /></Grid>
        <Grid size={{ xs: 6, md: 2 }}><Tile label="Delivered today" value={data.delivered_today} color="#2e7d32" /></Grid>
      </Grid>

      <Paper sx={{ borderRadius: 2, overflowX: 'auto' }}>
        <Typography variant="h6" sx={{ p: 2, pb: 0, fontWeight: 700 }}>Work in each department</Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Work center</TableCell>
              <TableCell align="right">Waiting to start</TableCell>
              <TableCell align="right">In progress</TableCell>
              <TableCell align="right">On hold</TableCell>
              <TableCell align="right">Finished today</TableCell>
              <TableCell align="right">Average time per step (7 days)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.by_work_center.map((c) => (
              <TableRow key={c.id}>
                <TableCell><Box component="span" sx={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', bgcolor: c.color || '#9e9e9e', mr: 1 }} />{c.name}</TableCell>
                <TableCell align="right">{c.ready}</TableCell>
                <TableCell align="right">{c.in_progress}</TableCell>
                <TableCell align="right">{c.on_hold}</TableCell>
                <TableCell align="right">{c.done_today}</TableCell>
                <TableCell align="right">{fmtMinutes(c.avg_minutes)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper sx={{ borderRadius: 2, overflowX: 'auto', height: '100%' }}>
            <Typography variant="h6" sx={{ p: 2, pb: 0, fontWeight: 700 }}>Who is doing what</Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Employee</TableCell>
                  <TableCell align="right">Working on</TableCell>
                  <TableCell align="right">Waiting on them</TableCell>
                  <TableCell align="right">Done today</TableCell>
                  <TableCell align="right">Done this week</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.by_employee.map((e) => (
                  <TableRow key={e.user_id}>
                    <TableCell>{e.name}</TableCell>
                    <TableCell align="right">{e.in_progress}</TableCell>
                    <TableCell align="right">{e.assigned_waiting}{e.on_hold ? ` (+${e.on_hold} on hold)` : ''}</TableCell>
                    <TableCell align="right">{e.done_today}</TableCell>
                    <TableCell align="right">{e.done_week}</TableCell>
                  </TableRow>
                ))}
                {data.by_employee.length === 0 && (
                  <TableRow><TableCell colSpan={5} align="center" sx={{ color: 'text.secondary', py: 3 }}>No one has picked up work yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper sx={{ p: 2, borderRadius: 2, height: '100%' }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>Steps finished, last 7 days</Typography>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-end', height: 140 }}>
              {data.trend.map((t) => (
                <Box key={t.date} sx={{ flex: 1, textAlign: 'center' }}>
                  <Typography variant="caption">{t.steps_done}</Typography>
                  <Box sx={{ height: `${Math.max((t.steps_done / maxDone) * 100, 3)}px`, bgcolor: '#3949ab', borderRadius: 0.5 }} />
                  <Typography variant="caption" color="text.secondary">{t.date.slice(5)}</Typography>
                </Box>
              ))}
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Orders delivered: {data.trend.map((t) => t.orders_delivered).reduce((a, b) => a + b, 0)} in 7 days.
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper sx={{ borderRadius: 2, overflowX: 'auto', height: '100%' }}>
            <Typography variant="h6" sx={{ p: 2, pb: 0, fontWeight: 700 }}>Overdue orders</Typography>
            <Table size="small">
              <TableHead>
                <TableRow><TableCell>Job</TableCell><TableCell>Customer</TableCell><TableCell>Was due</TableCell><TableCell>Now at</TableCell></TableRow>
              </TableHead>
              <TableBody>
                {data.overdue.map((o) => (
                  <TableRow key={o.job_card_id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/job-cards/${o.job_card_id}/track`)}>
                    <TableCell>{o.job_number}</TableCell>
                    <TableCell>{o.customer_name}</TableCell>
                    <TableCell>{o.delivery_date}</TableCell>
                    <TableCell>{o.current_step ?? '-'}{o.current_assignee ? ` (${o.current_assignee})` : o.current_work_center ? ` (${o.current_work_center})` : ''}</TableCell>
                  </TableRow>
                ))}
                {data.overdue.length === 0 && (
                  <TableRow><TableCell colSpan={4} align="center" sx={{ color: 'text.secondary', py: 3 }}>Nothing is overdue.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper sx={{ borderRadius: 2, overflowX: 'auto', height: '100%' }}>
            <Typography variant="h6" sx={{ p: 2, pb: 0, fontWeight: 700 }}>Waiting the longest to be started</Typography>
            <Table size="small">
              <TableHead>
                <TableRow><TableCell>Job</TableCell><TableCell>Step</TableCell><TableCell>Team</TableCell><TableCell align="right">Waiting</TableCell></TableRow>
              </TableHead>
              <TableBody>
                {data.waiting_longest.map((w) => (
                  <TableRow key={`${w.job_card_id}-${w.step_name}`} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/job-cards/${w.job_card_id}/track`)}>
                    <TableCell>{w.job_number}</TableCell>
                    <TableCell>{w.step_name}</TableCell>
                    <TableCell>{w.work_center_name}</TableCell>
                    <TableCell align="right">{fmtMinutes(w.waiting_minutes)}</TableCell>
                  </TableRow>
                ))}
                {data.waiting_longest.length === 0 && (
                  <TableRow><TableCell colSpan={4} align="center" sx={{ color: 'text.secondary', py: 3 }}>No job is waiting.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Paper>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper sx={{ borderRadius: 2, overflowX: 'auto', height: '100%' }}>
            <Typography variant="h6" sx={{ p: 2, pb: 0, fontWeight: 700 }}>With outside companies</Typography>
            <Table size="small">
              <TableHead>
                <TableRow><TableCell>Outsource job</TableCell><TableCell>Company</TableCell><TableCell>Work</TableCell><TableCell>Back by</TableCell></TableRow>
              </TableHead>
              <TableBody>
                {data.outside_work.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>{o.job_number}</TableCell>
                    <TableCell>{o.vendor ?? '-'}</TableCell>
                    <TableCell>{o.service}</TableCell>
                    <TableCell>{o.expected_date ?? '-'} {o.late && <Chip size="small" color="error" label="late" />}</TableCell>
                  </TableRow>
                ))}
                {data.outside_work.length === 0 && (
                  <TableRow><TableCell colSpan={4} align="center" sx={{ color: 'text.secondary', py: 3 }}>Nothing is out with an outside company.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper sx={{ borderRadius: 2, overflowX: 'auto', height: '100%' }}>
            <Typography variant="h6" sx={{ p: 2, pb: 0, fontWeight: 700 }}>On hold</Typography>
            <Table size="small">
              <TableHead>
                <TableRow><TableCell>Job</TableCell><TableCell>Step</TableCell><TableCell>Why</TableCell></TableRow>
              </TableHead>
              <TableBody>
                {data.on_hold.map((h) => (
                  <TableRow key={`${h.job_card_id}-${h.step_name}`} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/job-cards/${h.job_card_id}/track`)}>
                    <TableCell>{h.job_number}</TableCell>
                    <TableCell>{h.step_name}</TableCell>
                    <TableCell>{h.reason}</TableCell>
                  </TableRow>
                ))}
                {data.on_hold.length === 0 && (
                  <TableRow><TableCell colSpan={3} align="center" sx={{ color: 'text.secondary', py: 3 }}>Nothing is on hold.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Paper>
        </Grid>
      </Grid>
    </Stack>
  );
}

/** The whole shop on one screen: a column per department with the jobs in it, and a Monitor tab with the figures. */
export default function ProductionBoard() {
  const { user } = useAuth();
  const canMonitor = user?.role === 'admin' || user?.role === 'counter' || user?.role === 'accounts';
  const [tab, setTab] = useState<'board' | 'monitor'>('board');
  const [overdue, setOverdue] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const board = useQuery({
    queryKey: ['production-board', overdue, urgent],
    queryFn: () => workflowApi.board({ overdue, urgent }),
    refetchInterval: 30000,
  });
  const summary = useQuery({ queryKey: ['production-summary'], queryFn: workflowApi.summary, enabled: canMonitor && tab === 'monitor', refetchInterval: 60000 });
  const columns = board.data?.columns ?? [];

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 1 }}>Production</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab value="board" label="Board" />
        {canMonitor && <Tab value="monitor" label="Monitor" />}
      </Tabs>

      {tab === 'board' && (
        <>
          <Stack direction="row" spacing={2} sx={{ mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <FormControlLabel control={<Switch checked={overdue} onChange={(e) => setOverdue(e.target.checked)} />} label="Only overdue" />
            <FormControlLabel control={<Switch checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />} label="Only urgent / high" />
            <Typography variant="body2" color="text.secondary">
              {columns.reduce((n, c) => n + c.cards.length, 0)} pieces of work open. Click a job number to see all its steps.
            </Typography>
          </Stack>
          {board.isLoading && <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>}
          {board.isError && <Alert severity="error">Could not load the board.</Alert>}
          <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', alignItems: 'flex-start', pb: 2 }}>
            {columns.map((col) => (
              <Paper key={col.name} sx={{ minWidth: 300, width: 320, flexShrink: 0, borderRadius: 2, bgcolor: '#eef0f6', p: 1.5 }} data-testid="board-column">
                <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                  <Typography sx={{ fontWeight: 800, color: col.color || '#37474f' }}>{col.name}</Typography>
                  <Chip size="small" label={col.cards.length} />
                </Stack>
                <Stack spacing={1.25} sx={{ maxHeight: '68vh', overflowY: 'auto' }}>
                  {(expanded[col.name] ? col.cards : col.cards.slice(0, CARD_LIMIT)).map((c) => <WorkCardView key={c.id} card={c} compact />)}
                  {col.cards.length > CARD_LIMIT && !expanded[col.name] && (
                    <Button size="small" onClick={() => setExpanded((prev) => ({ ...prev, [col.name]: true }))}>
                      Show {col.cards.length - CARD_LIMIT} more
                    </Button>
                  )}
                  {col.cards.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>Nothing here</Typography>}
                </Stack>
              </Paper>
            ))}
          </Box>
        </>
      )}

      {tab === 'monitor' && canMonitor && (
        <>
          {summary.isLoading && <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>}
          {summary.isError && <Alert severity="error">Could not load the monitor.</Alert>}
          {summary.data && <Monitor data={summary.data} />}
        </>
      )}
    </Box>
  );
}
