import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Box, Typography, Paper, Button, TextField, Stack, Grid, Table, TableHead,
  TableRow, TableCell, TableBody, CircularProgress, ToggleButtonGroup, ToggleButton, Chip,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import { reportsApi } from '../api/reportsApi';

type Preset = 'today' | 'week' | 'month' | 'custom';

const FUNNEL_LABELS: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  approved: 'Approved',
  rejected: 'Rejected',
  converted: 'Converted',
};

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
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

export default function Reports() {
  const [preset, setPreset] = useState<Preset>('today');
  const initial = rangeForPreset('today');
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);

  const handlePreset = (value: Preset) => {
    setPreset(value);
    if (value !== 'custom') {
      const range = rangeForPreset(value);
      setStart(range.start);
      setEnd(range.end);
    }
  };

  const salesQuery = useQuery({
    queryKey: ['reports', 'sales', start, end],
    queryFn: () => reportsApi.sales(start, end),
    enabled: Boolean(start && end),
  });

  const comparison = salesQuery.data?.comparison;
  const percentChange = comparison?.percent_change ?? null;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 3 }}>
        Reports
      </Typography>

      <Paper sx={{ p: 3, borderRadius: 2, mb: 3 }}>
        <Box sx={{ mb: 2, overflowX: 'auto' }}>
          <ToggleButtonGroup
            size="small"
            value={preset}
            exclusive
            onChange={(_, v) => v && handlePreset(v)}
          >
            <ToggleButton value="today" sx={{ whiteSpace: 'nowrap' }}>Today</ToggleButton>
            <ToggleButton value="week" sx={{ whiteSpace: 'nowrap' }}>This Week</ToggleButton>
            <ToggleButton value="month" sx={{ whiteSpace: 'nowrap' }}>This Month</ToggleButton>
            <ToggleButton value="custom" sx={{ whiteSpace: 'nowrap' }}>Custom</ToggleButton>
          </ToggleButtonGroup>
        </Box>
        <Grid container spacing={2} sx={{ alignItems: 'center' }}>
          <Grid size={{ xs: 6, md: 4 }}>
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
          <Grid size={{ xs: 6, md: 4 }}>
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
          <Grid size={{ xs: 12, md: 4 }}>
            <Button
              variant="contained"
              startIcon={<DownloadIcon />}
              fullWidth
              sx={{ bgcolor: '#1a237e' }}
              onClick={() => reportsApi.downloadSalesExcel(start, end)}
            >
              Excel
            </Button>
          </Grid>
        </Grid>
      </Paper>

      <Paper sx={{ p: 3, borderRadius: 2, mb: 3 }}>
        <Stack direction="row" spacing={4} sx={{ flexWrap: 'wrap', rowGap: 2 }}>
          <Box>
            <Typography color="text.secondary" variant="body2">Total Sales</Typography>
            <Typography variant="h3" sx={{ fontWeight: 'bold' }} color="#1a237e">
              ₹{(salesQuery.data?.grand_total ?? 0).toFixed(2)}
            </Typography>
            {percentChange !== null && (
              <Chip
                size="small"
                icon={percentChange >= 0 ? <TrendingUpIcon /> : <TrendingDownIcon />}
                label={`${percentChange >= 0 ? '+' : ''}${percentChange}% vs previous period`}
                color={percentChange >= 0 ? 'success' : 'error'}
                sx={{ mt: 0.5 }}
              />
            )}
          </Box>
          <Box>
            <Typography color="text.secondary" variant="body2">Invoices</Typography>
            <Typography variant="h3" sx={{ fontWeight: 'bold' }} color="#00695c">
              {salesQuery.data?.breakdown.reduce((sum, row) => sum + row.invoice_count, 0) ?? 0}
            </Typography>
          </Box>
          <Box>
            <Typography color="text.secondary" variant="body2">Avg. Job Turnaround</Typography>
            <Typography variant="h3" sx={{ fontWeight: 'bold' }} color="#e65100">
              {salesQuery.data?.avg_job_turnaround_days != null
                ? `${salesQuery.data.avg_job_turnaround_days}d`
                : '—'}
            </Typography>
          </Box>
        </Stack>
      </Paper>

      <Paper sx={{ borderRadius: 2, mb: 3 }}>
        {salesQuery.isLoading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <CircularProgress />
          </Box>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Invoices</TableCell>
                <TableCell>Total</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(salesQuery.data?.breakdown ?? []).map((row) => (
                <TableRow key={row.date}>
                  <TableCell>{row.date}</TableCell>
                  <TableCell>{row.invoice_count}</TableCell>
                  <TableCell>₹{row.total.toFixed(2)}</TableCell>
                </TableRow>
              ))}
              {(salesQuery.data?.breakdown ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                    No sales in this date range.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Paper>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ borderRadius: 2, overflowX: 'auto' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold', p: 2, pb: 0 }}>
              Walk-in vs. Phone/Remote
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Order Type</TableCell>
                  <TableCell>Invoices</TableCell>
                  <TableCell>Total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(salesQuery.data?.by_order_type ?? []).map((row) => (
                  <TableRow key={row.order_type}>
                    <TableCell>{row.order_type === 'offline' ? 'Walk-in' : 'Phone/Remote'}</TableCell>
                    <TableCell>{row.invoice_count}</TableCell>
                    <TableCell>₹{row.total.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
                {(salesQuery.data?.by_order_type ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} align="center" sx={{ color: 'text.secondary', py: 2 }}>
                      No sales in this date range.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ borderRadius: 2, overflowX: 'auto' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold', p: 2, pb: 0 }}>
              By Payment Method
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Method</TableCell>
                  <TableCell>Payments</TableCell>
                  <TableCell>Total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(salesQuery.data?.by_payment_method ?? []).map((row) => (
                  <TableRow key={row.method}>
                    <TableCell>{row.method.replace('_', ' ')}</TableCell>
                    <TableCell>{row.payment_count}</TableCell>
                    <TableCell>₹{row.total.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
                {(salesQuery.data?.by_payment_method ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} align="center" sx={{ color: 'text.secondary', py: 2 }}>
                      No payments recorded in this date range.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ borderRadius: 2, overflowX: 'auto' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold', p: 2, pb: 0 }}>
              Top Products by Revenue
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Product</TableCell>
                  <TableCell>Qty</TableCell>
                  <TableCell>Total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(salesQuery.data?.top_products ?? []).map((row) => (
                  <TableRow key={row.product_name}>
                    <TableCell>{row.product_name}</TableCell>
                    <TableCell>{row.quantity}</TableCell>
                    <TableCell>₹{row.total.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
                {(salesQuery.data?.top_products ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} align="center" sx={{ color: 'text.secondary', py: 2 }}>
                      No sales in this date range.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ borderRadius: 2, overflowX: 'auto' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold', p: 2, pb: 0 }}>
              By Category
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Category</TableCell>
                  <TableCell>Qty</TableCell>
                  <TableCell>Total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(salesQuery.data?.by_category ?? []).map((row) => (
                  <TableRow key={row.category_name}>
                    <TableCell>{row.category_name}</TableCell>
                    <TableCell>{row.quantity}</TableCell>
                    <TableCell>₹{row.total.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
                {(salesQuery.data?.by_category ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} align="center" sx={{ color: 'text.secondary', py: 2 }}>
                      No sales in this date range.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12 }}>
          <Paper sx={{ p: 2, borderRadius: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>
              Quotation Funnel
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Quotations created in this date range, by current status.
            </Typography>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
              {(salesQuery.data?.quotation_funnel ?? []).map((row) => (
                <Chip
                  key={row.status}
                  label={`${FUNNEL_LABELS[row.status] ?? row.status}: ${row.count}`}
                  variant="outlined"
                />
              ))}
              {(salesQuery.data?.quotation_funnel ?? []).length === 0 && (
                <Typography color="text.secondary" variant="body2">
                  No quotations created in this date range.
                </Typography>
              )}
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
