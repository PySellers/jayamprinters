import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert, Box, Chip, CircularProgress, Grid, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, ToggleButton,
  ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import { reportsApi } from '../../api/reportsApi';
import { getErrorMessage } from '../../utils/api';
import type { InsightTip, Insights } from '../../types/reports';

const INK = '#1a237e';
const BLUE = '#3949ab';
const LIGHT = '#9fa8da';
const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const compact = (n: number) => (n >= 10000000 ? `${(n / 10000000).toFixed(1)}Cr` : n >= 100000 ? `${(n / 100000).toFixed(1)}L` : n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${Math.round(n)}`);
const pct = (n: number | null | undefined, digits = 0) => (n === null || n === undefined ? '–' : `${n.toFixed(digits)}%`);
const signed = (n: number | null | undefined) => (n === null || n === undefined ? '–' : `${n > 0 ? '+' : ''}${n.toFixed(0)}%`);
const mins = (m: number | null | undefined) => (m === null || m === undefined ? '–' : m >= 120 ? `${(m / 60).toFixed(1)} h` : `${Math.round(m)} min`);

const TIP_STYLE: Record<InsightTip['kind'], { label: string; color: string; bg: string }> = {
  risk: { label: 'Needs attention', color: '#c62828', bg: '#fdecea' },
  opportunity: { label: 'Opportunity', color: '#ef6c00', bg: '#fff4e5' },
  insight: { label: 'Good to know', color: '#1565c0', bg: '#e8f1fb' },
  good: { label: 'Going well', color: '#2e7d32', bg: '#e8f5e9' },
  info: { label: 'Note', color: '#546e7a', bg: '#eceff1' },
};

// ---------------------------------------------------------------------------------------------------------------
// small SVG charts (no chart library: they stay light and print well)
// ---------------------------------------------------------------------------------------------------------------
function SalesChart({ data }: { data: Insights }) {
  const actual = data.monthly;
  const future = data.forecast.months;
  const all = [...actual.map((m) => ({ label: m.label, value: m.revenue, kind: m.partial ? 'partial' : 'actual', low: 0, high: 0 })),
    ...future.map((m) => ({ label: m.label, value: m.revenue, kind: 'forecast', low: m.low, high: m.high }))];
  const max = Math.max(1, ...all.map((m) => Math.max(m.value, m.high, m.kind === 'partial' ? data.forecast.this_month_projection : 0)));
  const W = 920, H = 260, L = 52, B = 34, T = 14;
  const slot = (W - L - 8) / all.length;
  const barW = Math.min(36, slot * 0.62);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const colour = { actual: BLUE, partial: LIGHT, forecast: '#ffb74d' } as const;
  return (
    <Box sx={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Monthly sales, this month so far and the three-month forecast" style={{ minWidth: 560 }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - 4} y1={y(max * t)} y2={y(max * t)} stroke="#e3e6f2" />
            <text x={L - 6} y={y(max * t) + 4} fontSize="11" textAnchor="end" fill="#607d8b">{compact(max * t)}</text>
          </g>
        ))}
        {all.map((m, i) => {
          const x = L + slot * i + (slot - barW) / 2;
          const cx = x + barW / 2;
          const top = y(m.value);
          return (
            <g key={m.label}>
              <title>{`${m.label}: ${rupees(m.value)}${m.kind === 'forecast' ? ` (expected ${rupees(m.low)} to ${rupees(m.high)})` : m.kind === 'partial' ? ' so far this month' : ''}`}</title>
              <rect x={x} y={top} width={barW} height={Math.max(H - B - top, 0)} rx={3} fill={colour[m.kind as keyof typeof colour]} opacity={m.kind === 'forecast' ? 0.85 : 1} />
              {m.kind === 'partial' && (
                <rect x={x} y={y(data.forecast.this_month_projection)} width={barW} height={Math.max(top - y(data.forecast.this_month_projection), 0)} rx={3} fill="none" stroke={BLUE} strokeDasharray="4 3" />
              )}
              {m.kind === 'forecast' && (
                <g stroke="#e65100" strokeWidth={1.5}>
                  <line x1={cx} x2={cx} y1={y(m.high)} y2={y(m.low)} />
                  <line x1={cx - 5} x2={cx + 5} y1={y(m.high)} y2={y(m.high)} />
                  <line x1={cx - 5} x2={cx + 5} y1={y(m.low)} y2={y(m.low)} />
                </g>
              )}
              <text x={cx} y={H - 16} fontSize="10.5" textAnchor="middle" fill="#455a64">{m.label.split(' ')[0]}</text>
              <text x={cx} y={H - 4} fontSize="9.5" textAnchor="middle" fill="#90a4ae">{m.label.split(' ')[1]}</text>
            </g>
          );
        })}
      </svg>
      <Stack direction="row" sx={{ gap: 2, flexWrap: 'wrap', mt: 0.5 }}>
        <Legend colour={BLUE} label="Sales (without GST)" />
        <Legend colour={LIGHT} label="This month so far (dashed = projected month-end)" />
        <Legend colour="#ffb74d" label="Forecast (whisker = likely range)" />
      </Stack>
    </Box>
  );
}

function Legend({ colour, label }: { colour: string; label: string }) {
  return <Typography variant="caption" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}><Box component="span" sx={{ width: 12, height: 12, borderRadius: 0.5, bgcolor: colour, display: 'inline-block' }} />{label}</Typography>;
}

interface BarRow { label: string; value: number; display: string; sub?: string; color?: string }
function HBars({ rows, max, empty }: { rows: BarRow[]; max?: number; empty?: string }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <Typography variant="body2" color="text.secondary">{empty ?? 'No data yet.'}</Typography>;
  return (
    <Stack spacing={0.9}>
      {rows.map((r, i) => (
        <Box key={`${r.label}-${i}`}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap title={r.label}>{r.label}</Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{r.display}</Typography>
          </Stack>
          <Box sx={{ height: 9, bgcolor: '#eef0fa', borderRadius: 5, overflow: 'hidden' }}>
            <Box sx={{ height: '100%', width: `${Math.max(Math.min(r.value / top, 1) * 100, r.value > 0 ? 2 : 0)}%`, bgcolor: r.color ?? BLUE, borderRadius: 5 }} />
          </Box>
          {r.sub && <Typography variant="caption" color="text.secondary">{r.sub}</Typography>}
        </Box>
      ))}
    </Stack>
  );
}

function Card({ title, hint, children, testId }: { title: string; hint?: string; children: React.ReactNode; testId?: string }) {
  return (
    <Paper sx={{ p: 2, borderRadius: 2, height: '100%' }} data-testid={testId}>
      <Typography sx={{ fontWeight: 800, color: INK }}>{title}</Typography>
      {hint && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>{hint}</Typography>}
      <Box sx={{ mt: hint ? 0 : 1 }}>{children}</Box>
    </Paper>
  );
}

function Kpi({ label, value, hint, color = INK, testId }: { label: string; value: string; hint?: string; color?: string; testId?: string }) {
  return (
    <Paper sx={{ p: 1.75, borderRadius: 2, height: '100%' }} data-testid={testId}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="h6" sx={{ fontWeight: 800, color, lineHeight: 1.25 }}>{value}</Typography>
      {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
    </Paper>
  );
}

// ---------------------------------------------------------------------------------------------------------------
export default function InsightsPanel() {
  const [days, setDays] = useState(180);
  const query = useQuery({ queryKey: ['insights', days], queryFn: () => reportsApi.insights(days), staleTime: 60000 });

  if (query.isLoading) return <Box sx={{ p: 6, textAlign: 'center' }}><CircularProgress /><Typography sx={{ mt: 1 }} color="text.secondary">Studying your jobs, prices and team...</Typography></Box>;
  if (query.isError || !query.data) return <Alert severity="error">{getErrorMessage(query.error, 'Could not load the insights.')}</Alert>;

  const d = query.data;
  const h = d.headline;
  const f = d.forecast;
  const TrendIcon = f.trend === 'up' ? TrendingUpIcon : f.trend === 'down' ? TrendingDownIcon : TrendingFlatIcon;
  const trendColor = f.trend === 'up' ? '#2e7d32' : f.trend === 'down' ? '#c62828' : '#607d8b';
  const maxWeekday = Math.max(1, ...d.weekdays.map((w) => w.orders));
  const agingTotal = d.receivables.aging.reduce((a, b) => a + b.amount, 0);
  const agingColor = ['#66bb6a', '#ffa726', '#e53935'];
  const scored = d.employees.filter((e) => e.score !== null);
  const idle = d.employees.filter((e) => e.score === null && e.role !== 'admin');

  return (
    <Box data-testid="insights">
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800, color: INK }}>AI Insights</Typography>
          <Typography variant="body2" color="text.secondary">
            Worked out from your own invoices, jobs and team records ({d.period.start} to {d.period.end}). Nothing leaves this system. Only the Admin sees this page.
          </Typography>
        </Box>
        <ToggleButtonGroup size="small" exclusive value={days} onChange={(_, v) => v && setDays(v)} data-testid="insight-range">
          <ToggleButton value={90}>3 months</ToggleButton>
          <ToggleButton value={180}>6 months</ToggleButton>
          <ToggleButton value={365}>1 year</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {/* the numbers that matter */}
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid size={{ xs: 6, md: 3 }}><Kpi testId="kpi-sales" label="Sales (without GST)" value={rupees(h.revenue)} hint={h.revenue_change_percent === null ? `${h.orders} invoices` : `${signed(h.revenue_change_percent)} vs the period before · ${h.orders} invoices`} color={INK} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Kpi testId="kpi-ontime" label="Delivered on time" value={pct(h.on_time_percent)} hint={`Average ${h.avg_turnaround_days ?? '–'} days from order to delivery`} color={(h.on_time_percent ?? 100) < 80 ? '#c62828' : '#2e7d32'} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Kpi testId="kpi-open" label="Open jobs" value={String(h.open_jobs)} hint={`${h.overdue_jobs} overdue · ${h.delivered_jobs} delivered`} color={h.overdue_jobs > 0 ? '#ef6c00' : INK} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Kpi testId="kpi-owed" label="Customers still owe" value={rupees(h.receivable)} hint={`Average bill ${rupees(h.avg_order_value)}`} color="#6a1b9a" /></Grid>
      </Grid>

      {/* advice first: it is what the owner reads */}
      <Paper sx={{ p: 2, borderRadius: 2, mb: 2 }} data-testid="recommendations">
        <Typography sx={{ fontWeight: 800, color: INK }}>What to do next</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.25 }}>Each point shows the figures it is based on. Most important first.</Typography>
        <Grid container spacing={1.25}>
          {d.recommendations.map((t, i) => {
            const st = TIP_STYLE[t.kind];
            return (
              <Grid key={i} size={{ xs: 12, md: 6 }}>
                <Box data-testid="tip" data-kind={t.kind} sx={{ p: 1.5, borderRadius: 2, bgcolor: st.bg, borderLeft: `5px solid ${st.color}`, height: '100%' }}>
                  <Stack direction="row" sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 0.5 }}>
                    <Chip size="small" label={st.label} sx={{ bgcolor: st.color, color: '#fff', fontWeight: 700, height: 20 }} />
                    <Chip size="small" variant="outlined" label={t.area} sx={{ height: 20 }} />
                    {t.metric && <Typography variant="caption" sx={{ ml: 'auto', fontWeight: 800, color: st.color }}>{t.metric}</Typography>}
                  </Stack>
                  <Typography sx={{ fontWeight: 800 }}>{t.title}</Typography>
                  <Typography variant="body2" color="text.secondary">{t.detail}</Typography>
                </Box>
              </Grid>
            );
          })}
          {d.recommendations.length === 0 && <Grid size={12}><Typography color="text.secondary">Nothing stands out right now.</Typography></Grid>}
        </Grid>
      </Paper>

      {/* sales and the forecast */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Card title="Sales by month and the next three months" hint={f.method} testId="sales-chart">
            <SalesChart data={d} />
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Card title="Forecast" hint={`Confidence: ${f.confidence} (more months of history = more reliable)`} testId="forecast">
            <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 1 }}>
              <TrendIcon sx={{ color: trendColor }} />
              <Typography sx={{ fontWeight: 800, color: trendColor }}>Trending {f.trend === 'flat' ? 'steady' : f.trend}</Typography>
            </Stack>
            <Typography variant="body2">This month so far <strong>{rupees(f.this_month_so_far)}</strong>, on course for about <strong>{rupees(f.this_month_projection)}</strong>.</Typography>
            <Table size="small" sx={{ mt: 1 }}>
              <TableHead><TableRow><TableCell>Month</TableCell><TableCell align="right">Expected</TableCell><TableCell align="right">Range</TableCell></TableRow></TableHead>
              <TableBody>
                {f.months.map((m) => (
                  <TableRow key={m.month}><TableCell>{m.label}</TableCell><TableCell align="right" sx={{ fontWeight: 700 }}>{rupees(m.revenue)}</TableCell><TableCell align="right" sx={{ color: 'text.secondary' }}>{compact(m.low)}–{compact(m.high)}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>A forecast is an educated guess from past months, not a promise. Festival seasons can change it.</Typography>
          </Card>
        </Grid>
      </Grid>

      {/* services */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, lg: 5 }}>
          <Card title="Which services earn the most" hint="Share of sales in the period" testId="service-chart">
            <HBars rows={d.services.slice(0, 8).map((s) => ({ label: s.name, value: s.revenue, display: `${rupees(s.revenue)} · ${pct(s.share)}`, sub: s.trend_percent === null ? undefined : `${signed(s.trend_percent)} vs the period before` }))} />
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Card title="Services: speed and prices" hint="Delivery time, on-time rate and discounts per service" testId="service-table">
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow><TableCell>Service</TableCell><TableCell align="right">Jobs</TableCell><TableCell align="right">Avg bill</TableCell><TableCell align="right">Days to deliver</TableCell><TableCell align="right">On time</TableCell><TableCell align="right">Discount</TableCell><TableCell align="right">Urgent</TableCell></TableRow>
                </TableHead>
                <TableBody>
                  {d.services.slice(0, 12).map((s) => (
                    <TableRow key={s.name}>
                      <TableCell sx={{ fontWeight: 600 }}>{s.name}</TableCell>
                      <TableCell align="right">{s.jobs}</TableCell>
                      <TableCell align="right">{rupees(s.avg_order_value)}</TableCell>
                      <TableCell align="right">{s.avg_turnaround_days ?? '–'}</TableCell>
                      <TableCell align="right" sx={{ color: s.on_time_percent !== null && s.on_time_percent < 70 ? '#c62828' : undefined }}>{pct(s.on_time_percent)}</TableCell>
                      <TableCell align="right">{pct(s.discount_percent, 1)}</TableCell>
                      <TableCell align="right">{pct(s.urgent_percent)}</TableCell>
                    </TableRow>
                  ))}
                  {d.services.length === 0 && <TableRow><TableCell colSpan={7} align="center" sx={{ color: 'text.secondary' }}>No services billed in this period.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </Box>
          </Card>
        </Grid>
      </Grid>

      {/* the team */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Card title="Employee performance" hint="Score = speed against the team on the same kind of step (40%) + amount of work finished (35%) + work that did not have to be redone (25%)" testId="employee-table">
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow><TableCell>#</TableCell><TableCell>Employee</TableCell><TableCell align="right">Steps done</TableCell><TableCell align="right">Avg time / step</TableCell><TableCell align="right">Speed vs team</TableCell><TableCell align="right">Redone</TableCell><TableCell align="right">Now</TableCell><TableCell align="right">Score</TableCell></TableRow>
                </TableHead>
                <TableBody>
                  {scored.map((e) => (
                    <TableRow key={e.user_id} data-testid="employee-row">
                      <TableCell>{e.rank}</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>{e.name}<Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.75, textTransform: 'capitalize' }}>{e.role}</Typography></TableCell>
                      <TableCell align="right">{e.steps_done}</TableCell>
                      <TableCell align="right">{mins(e.avg_minutes)}</TableCell>
                      <TableCell align="right" sx={{ color: e.speed_vs_team === null ? undefined : e.speed_vs_team >= 0 ? '#2e7d32' : '#c62828', fontWeight: 600 }}>{signed(e.speed_vs_team)}</TableCell>
                      <TableCell align="right">{e.rework}</TableCell>
                      <TableCell align="right">{e.working_now} working{e.waiting_on_them > 0 ? `, ${e.waiting_on_them} waiting` : ''}</TableCell>
                      <TableCell align="right"><Chip size="small" label={e.score} sx={{ fontWeight: 800, bgcolor: (e.score ?? 0) >= 75 ? '#e8f5e9' : (e.score ?? 0) >= 50 ? '#fff4e5' : '#fdecea' }} /></TableCell>
                    </TableRow>
                  ))}
                  {scored.length === 0 && <TableRow><TableCell colSpan={8} align="center" sx={{ color: 'text.secondary', py: 2 }}>No finished steps with an employee name yet. As soon as employees Take / Start / Done their tasks, they appear here.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </Box>
            {idle.length > 0 && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>No recorded work yet: {idle.map((e) => e.name).join(', ')}.</Typography>}
            {d.employee_data_share !== null && d.employee_data_share < 100 && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{d.employee_data_share}% of finished steps have a person recorded; the rest were finished before names were tracked.</Typography>
            )}
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 5 }}>
          <Card title="Where work waits" hint="Average wait before work starts, by section" testId="workcenter-chart">
            <HBars
              rows={d.work_centers.filter((w) => w.avg_wait_minutes !== null || w.open_now > 0).map((w) => ({
                label: w.name, value: w.avg_wait_minutes ?? 0, display: mins(w.avg_wait_minutes), color: w.color || BLUE,
                sub: `${w.open_now} open now (about ${w.backlog_hours} h of work) · ${w.steps_done} done · ${mins(w.avg_minutes)} per step`,
              }))}
              empty="No section has finished enough steps to measure yet."
            />
          </Card>
        </Grid>
      </Grid>

      {/* risk */}
      <Paper sx={{ p: 2, borderRadius: 2, mb: 2 }} data-testid="risk-list">
        <Typography sx={{ fontWeight: 800, color: INK }}>Open jobs likely to miss their delivery date</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>Predicted from the time each step normally takes and how long this service usually takes. Urgent jobs first.</Typography>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead><TableRow><TableCell>Job</TableCell><TableCell>Customer</TableCell><TableCell>Service</TableCell><TableCell>Promised</TableCell><TableCell>Likely finish</TableCell><TableCell>Stuck at</TableCell></TableRow></TableHead>
            <TableBody>
              {d.delivery_risk.map((r) => (
                <TableRow key={r.job_card_id} hover>
                  <TableCell sx={{ fontWeight: 700 }}>{r.job_number}{r.urgent && <Chip size="small" color="error" label="URGENT" sx={{ ml: 1, height: 18, fontWeight: 800 }} />}</TableCell>
                  <TableCell>{r.customer}</TableCell>
                  <TableCell>{r.service}</TableCell>
                  <TableCell>{r.due_date}</TableCell>
                  <TableCell sx={{ color: r.already_late ? '#c62828' : '#ef6c00', fontWeight: 700 }}>{r.already_late ? `Already late (${r.days_late} d)` : `${r.predicted_finish} (+${r.days_late} d)`}</TableCell>
                  <TableCell>{r.stuck_at ?? '–'}</TableCell>
                </TableRow>
              ))}
              {d.delivery_risk.length === 0 && <TableRow><TableCell colSpan={6} align="center" sx={{ color: 'text.secondary' }}>No open job is expected to be late.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Box>
      </Paper>

      {/* customers, money, days */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card title="Best customers" hint={d.customers.top3_share !== null ? `The top 3 are ${pct(d.customers.top3_share)} of sales` : undefined} testId="customer-chart">
            <HBars rows={d.customers.top.slice(0, 6).map((c) => ({ label: c.name, value: c.revenue, display: rupees(c.revenue), sub: `${c.orders} orders · last ${c.last_order ?? '–'}` }))} />
            {d.customers.dormant.length > 0 && (
              <Box sx={{ mt: 1.5 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Gone quiet - worth a call</Typography>
                {d.customers.dormant.slice(0, 4).map((c, i) => (
                  <Typography key={`${c.name}-${i}`} variant="body2">{c.name} <Typography component="span" variant="caption" color="text.secondary">· {c.days_since} days · spent {rupees(c.lifetime_revenue)}{c.phone ? ` · ${c.phone}` : ''}</Typography></Typography>
                ))}
              </Box>
            )}
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card title="Money still to collect" hint={`${rupees(d.receivables.total)} in total`} testId="aging-chart">
            <Box sx={{ display: 'flex', height: 16, borderRadius: 8, overflow: 'hidden', bgcolor: '#eef0fa', mb: 1 }}>
              {d.receivables.aging.map((a, i) => <Tooltip key={a.bucket} title={`${a.bucket}: ${rupees(a.amount)}`}><Box sx={{ width: `${agingTotal ? (a.amount / agingTotal) * 100 : 0}%`, bgcolor: agingColor[i] }} /></Tooltip>)}
            </Box>
            {d.receivables.aging.map((a, i) => <Typography key={a.bucket} variant="body2" sx={{ display: 'flex', justifyContent: 'space-between' }}><span><Box component="span" sx={{ display: 'inline-block', width: 10, height: 10, bgcolor: agingColor[i], borderRadius: 0.5, mr: 0.75 }} />{a.bucket}</span><strong>{rupees(a.amount)}</strong></Typography>)}
            {d.receivables.top.length > 0 && <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 1.5 }}>Owe the most</Typography>}
            {d.receivables.top.map((t, i) => <Typography key={`${t.name}-${i}`} variant="body2" sx={{ display: 'flex', justifyContent: 'space-between' }}><span>{t.name}</span><strong>{rupees(t.amount)}</strong></Typography>)}
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card title="Busiest days of the week" hint="Invoices raised per weekday" testId="weekday-chart">
            <HBars max={maxWeekday} rows={d.weekdays.map((w) => ({ label: w.day, value: w.orders, display: `${w.orders} orders`, color: w.orders === maxWeekday ? '#ef6c00' : BLUE }))} />
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
