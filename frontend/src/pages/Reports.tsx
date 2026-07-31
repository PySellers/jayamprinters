import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Box, Typography, Paper, Button, TextField, Stack, Grid, Table, TableHead,
  TableRow, TableCell, TableBody, CircularProgress, ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import { reportsApi } from '../api/reportsApi';

type Preset = 'today' | 'week' | 'month' | 'custom';

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

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 3 }}>
        Reports
      </Typography>

      <Paper sx={{ p: 3, borderRadius: 2, mb: 3 }}>
        <Grid container spacing={2} sx={{ alignItems: 'center' }}>
          <Grid size={{ xs: 12, md: 4 }}>
            <ToggleButtonGroup
              size="small"
              value={preset}
              exclusive
              onChange={(_, v) => v && handlePreset(v)}
            >
              <ToggleButton value="today">Today</ToggleButton>
              <ToggleButton value="week">This Week</ToggleButton>
              <ToggleButton value="month">This Month</ToggleButton>
              <ToggleButton value="custom">Custom</ToggleButton>
            </ToggleButtonGroup>
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
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
          <Grid size={{ xs: 6, md: 3 }}>
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
          <Grid size={{ xs: 12, md: 2 }}>
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
        <Stack direction="row" spacing={4}>
          <Box>
            <Typography color="text.secondary" variant="body2">Total Sales</Typography>
            <Typography variant="h3" sx={{ fontWeight: 'bold' }} color="#1a237e">
              ₹{(salesQuery.data?.grand_total ?? 0).toFixed(2)}
            </Typography>
          </Box>
          <Box>
            <Typography color="text.secondary" variant="body2">Invoices</Typography>
            <Typography variant="h3" sx={{ fontWeight: 'bold' }} color="#00695c">
              {salesQuery.data?.breakdown.reduce((sum, row) => sum + row.invoice_count, 0) ?? 0}
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

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ borderRadius: 2 }}>
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
          <Paper sx={{ borderRadius: 2 }}>
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
      </Grid>
    </Box>
  );
}
