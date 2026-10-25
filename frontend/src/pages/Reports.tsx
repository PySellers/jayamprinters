import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Box, Typography, Paper, Button, TextField, Stack, Grid, Table, TableHead, TableRow, TableCell,
  TableBody, TableContainer, CircularProgress, ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import { reportsApi } from '../api/reportsApi';
import type { StatementGroup } from '../types/reports';

type Preset = 'today' | 'week' | 'month' | 'custom';

function toDateString(d: Date): string {
  // local calendar date (toISOString would shift it to UTC)
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function rangeForPreset(preset: Preset): { start: string; end: string } {
  const today = new Date();
  const end = toDateString(today);
  if (preset === 'today') {
    return { start: end, end };
  }
  if (preset === 'week') {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    return { start: toDateString(start), end };
  }
  if (preset === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { start: toDateString(start), end };
  }
  return { start: end, end };
}

const rupees = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const percent = (n: number | null) => (n === null ? '–' : `${n.toFixed(1)}%`);

export default function Reports() {
  const [preset, setPreset] = useState<Preset>('month');
  const initial = rangeForPreset('month');
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [group, setGroup] = useState<StatementGroup>('day');

  const handlePreset = (value: Preset) => {
    setPreset(value);
    if (value !== 'custom') {
      const range = rangeForPreset(value);
      setStart(range.start);
      setEnd(range.end);
    }
  };

  const statementQuery = useQuery({
    queryKey: ['reports', 'statement', start, end, group],
    queryFn: () => reportsApi.statement(start, end, group),
    enabled: Boolean(start && end),
  });
  const data = statementQuery.data;
  const totals = data?.totals;

  const cards: { label: string; value: string; color: string; hint?: string }[] = [
    { label: 'Total Sales', value: rupees(totals?.sales ?? 0), color: '#1a237e', hint: 'without GST' },
    { label: 'GST collected', value: rupees(totals?.gst_collected ?? 0), color: '#6a1b9a', hint: 'on those sales' },
    { label: 'Total costs', value: rupees(totals?.total_costs ?? 0), color: '#e65100', hint: 'purchases + outsourcing + expenses' },
    {
      label: 'Profit',
      value: rupees(totals?.profit ?? 0),
      color: (totals?.profit ?? 0) >= 0 ? '#00695c' : '#c62828',
      hint: `margin ${percent(totals?.margin_percent ?? null)}`,
    },
  ];

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 3 }}>
        Reports
      </Typography>

      <Paper sx={{ p: 3, borderRadius: 2, mb: 3 }}>
        <Grid container spacing={2} sx={{ alignItems: 'center' }}>
          <Grid size={{ xs: 12, md: 4 }}>
            <ToggleButtonGroup size="small" value={preset} exclusive onChange={(_, v) => v && handlePreset(v)}>
              <ToggleButton value="today">Today</ToggleButton>
              <ToggleButton value="week">This Week</ToggleButton>
              <ToggleButton value="month">This Month</ToggleButton>
              <ToggleButton value="custom">Custom</ToggleButton>
            </ToggleButtonGroup>
          </Grid>
          <Grid size={{ xs: 6, md: 2.5 }}>
            <TextField
              label="Start"
              type="date"
              fullWidth
              size="small"
              value={start}
              onChange={(e) => { setPreset('custom'); setStart(e.target.value); }}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>
          <Grid size={{ xs: 6, md: 2.5 }}>
            <TextField
              label="End"
              type="date"
              fullWidth
              size="small"
              value={end}
              onChange={(e) => { setPreset('custom'); setEnd(e.target.value); }}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <Button
              variant="contained"
              startIcon={<DownloadIcon />}
              fullWidth
              sx={{ bgcolor: '#1a237e' }}
              onClick={() => reportsApi.downloadStatementExcel(start, end, group)}
            >
              Excel
            </Button>
          </Grid>
          <Grid size={{ xs: 12 }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">Show figures</Typography>
              <ToggleButtonGroup size="small" value={group} exclusive onChange={(_, v) => v && setGroup(v)}>
                <ToggleButton value="day">Daily</ToggleButton>
                <ToggleButton value="week">Weekly</ToggleButton>
                <ToggleButton value="month">Monthly</ToggleButton>
              </ToggleButtonGroup>
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {cards.map((c) => (
          <Grid key={c.label} size={{ xs: 12, sm: 6, md: 3 }}>
            <Paper sx={{ p: 2.5, borderRadius: 2, height: '100%' }}>
              <Typography color="text.secondary" variant="body2">{c.label}</Typography>
              <Typography variant="h5" sx={{ fontWeight: 'bold', color: c.color }}>{c.value}</Typography>
              {c.hint && <Typography variant="caption" color="text.secondary">{c.hint}</Typography>}
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Paper sx={{ borderRadius: 2, mb: 3 }}>
        {statementQuery.isLoading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <CircularProgress />
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Period</TableCell>
                  <TableCell align="right">Invoices</TableCell>
                  <TableCell align="right">Sales</TableCell>
                  <TableCell align="right">GST collected</TableCell>
                  <TableCell align="right">Purchases</TableCell>
                  <TableCell align="right">Outsourcing</TableCell>
                  <TableCell align="right">Other expenses</TableCell>
                  <TableCell align="right">Profit</TableCell>
                  <TableCell align="right">Margin</TableCell>
                  <TableCell align="right">Money in</TableCell>
                  <TableCell align="right">Money out</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data?.rows ?? []).map((r) => (
                  <TableRow key={r.period_start}>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{r.label}</TableCell>
                    <TableCell align="right">{r.invoices}</TableCell>
                    <TableCell align="right">{rupees(r.sales)}</TableCell>
                    <TableCell align="right">{rupees(r.gst_collected)}</TableCell>
                    <TableCell align="right">{rupees(r.purchases)}</TableCell>
                    <TableCell align="right">{rupees(r.outsource_cost)}</TableCell>
                    <TableCell align="right">{rupees(r.other_expenses)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, color: r.profit >= 0 ? '#00695c' : '#c62828' }}>{rupees(r.profit)}</TableCell>
                    <TableCell align="right">{percent(r.margin_percent)}</TableCell>
                    <TableCell align="right">{rupees(r.collected)}</TableCell>
                    <TableCell align="right">{rupees(r.paid_out)}</TableCell>
                  </TableRow>
                ))}
                {(data?.rows ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                      No sales, purchases or expenses in this date range.
                    </TableCell>
                  </TableRow>
                )}
                {totals && (data?.rows ?? []).length > 0 && (
                  <TableRow sx={{ '& td': { fontWeight: 700, borderTop: '2px solid #1a237e' } }}>
                    <TableCell>Total</TableCell>
                    <TableCell align="right">{totals.invoices}</TableCell>
                    <TableCell align="right">{rupees(totals.sales)}</TableCell>
                    <TableCell align="right">{rupees(totals.gst_collected)}</TableCell>
                    <TableCell align="right">{rupees(totals.purchases)}</TableCell>
                    <TableCell align="right">{rupees(totals.outsource_cost)}</TableCell>
                    <TableCell align="right">{rupees(totals.other_expenses)}</TableCell>
                    <TableCell align="right" sx={{ color: totals.profit >= 0 ? '#00695c' : '#c62828' }}>{rupees(totals.profit)}</TableCell>
                    <TableCell align="right">{percent(totals.margin_percent)}</TableCell>
                    <TableCell align="right">{rupees(totals.collected)}</TableCell>
                    <TableCell align="right">{rupees(totals.paid_out)}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <Paper sx={{ p: 2.5, borderRadius: 2 }}>
            <Typography color="text.secondary" variant="body2">Still to receive from customers</Typography>
            <Typography variant="h5" sx={{ fontWeight: 'bold' }}>{rupees(data?.receivable ?? 0)}</Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <Paper sx={{ p: 2.5, borderRadius: 2 }}>
            <Typography color="text.secondary" variant="body2">Still to pay to suppliers and outside companies</Typography>
            <Typography variant="h5" sx={{ fontWeight: 'bold' }}>{rupees(data?.payable ?? 0)}</Typography>
          </Paper>
        </Grid>
      </Grid>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
        Profit = sales (without GST) minus stock purchases, outsourced job cost and other cash expenses. &quot;Money in / out&quot; is the cash, UPI and bank money actually received and paid in the period.
      </Typography>
    </Box>
  );
}
