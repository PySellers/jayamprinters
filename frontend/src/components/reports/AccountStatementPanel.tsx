import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Box, Button, Chip, CircularProgress, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField,
  ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import { reportsApi } from '../../api/reportsApi';

const rupees = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dmy = (s: string) => s.split('-').reverse().join('-');

/**
 * The shop's account statement, laid out like a bank statement: serial number, date, particulars, debit, credit and a running
 * balance - one line per transaction, grouped by day or week with the number of invoices / purchases of each group, and a
 * grand total at the end. "Sales and purchases" lists the bills; "Money in and out" lists only the money that moved.
 */
export default function AccountStatementPanel() {
  const today = new Date();
  const [start, setStart] = useState(iso(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [end, setEnd] = useState(iso(today));
  const [group, setGroup] = useState<'day' | 'week'>('day');
  const [basis, setBasis] = useState<'accrual' | 'cash'>('accrual');

  const query = useQuery({
    queryKey: ['account-statement', start, end, group, basis],
    queryFn: () => reportsApi.ledger(start, end, group, basis),
    enabled: Boolean(start && end && start <= end),
  });
  const data = query.data;

  return (
    <Box data-testid="account-statement">
      <Paper sx={{ p: 2, borderRadius: 2, mb: 2 }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1.5 }}>
          <TextField size="small" type="date" label="From" value={start} onChange={(e) => setStart(e.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'ledger-from' } }} />
          <TextField size="small" type="date" label="To" value={end} onChange={(e) => setEnd(e.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'ledger-to' } }} />
          <ToggleButtonGroup size="small" exclusive value={group} onChange={(_, v) => v && setGroup(v)}>
            <ToggleButton value="day" data-testid="ledger-day">Per day</ToggleButton>
            <ToggleButton value="week" data-testid="ledger-week">Per week</ToggleButton>
          </ToggleButtonGroup>
          <ToggleButtonGroup size="small" exclusive value={basis} onChange={(_, v) => v && setBasis(v)}>
            <ToggleButton value="accrual" data-testid="ledger-accrual">Sales and purchases</ToggleButton>
            <ToggleButton value="cash" data-testid="ledger-cash">Money in and out</ToggleButton>
          </ToggleButtonGroup>
          <Button variant="outlined" startIcon={<DownloadIcon />} disabled={!data} onClick={() => reportsApi.downloadLedgerExcel(start, end, group, basis)} data-testid="ledger-excel">
            Excel
          </Button>
        </Stack>
      </Paper>

      {query.isLoading && <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>}
      {data && (
        <Paper sx={{ borderRadius: 2 }}>
          <TableContainer>
            <Table size="small" data-testid="ledger-table">
              <TableHead>
                <TableRow sx={{ bgcolor: '#1a237e', '& th': { color: '#fff', fontWeight: 700 } }}>
                  <TableCell sx={{ width: 64 }}>Sr.No</TableCell>
                  <TableCell sx={{ width: 110 }}>Date</TableCell>
                  <TableCell>Particulars</TableCell>
                  <TableCell>Ref</TableCell>
                  <TableCell align="right">Debit (₹)</TableCell>
                  <TableCell align="right">Credit (₹)</TableCell>
                  <TableCell align="right">Balance (₹)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.periods.length === 0 && (
                  <TableRow><TableCell colSpan={7} align="center" sx={{ color: 'text.secondary', py: 4 }}>Nothing recorded in this period.</TableCell></TableRow>
                )}
                {data.periods.map((p) => (
                  <PeriodRows key={p.period_start} period={p} />
                ))}
                {data.periods.length > 0 && (
                  <TableRow sx={{ bgcolor: '#e8eaf6', '& td': { fontWeight: 800, fontSize: 14 } }} data-testid="ledger-grand-total">
                    <TableCell colSpan={4}>
                      GRAND TOTAL ({dmy(data.start)} to {dmy(data.end)}) · {data.totals.entries} entries
                      <Typography variant="caption" sx={{ display: 'block', fontWeight: 400 }}>{data.totals.summary}</Typography>
                    </TableCell>
                    <TableCell align="right">{rupees(data.totals.debit)}</TableCell>
                    <TableCell align="right">{rupees(data.totals.credit)}</TableCell>
                    <TableCell align="right" sx={{ color: data.totals.balance >= 0 ? '#00695c' : '#c62828' }}>{rupees(data.totals.balance)}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
        {basis === 'accrual'
          ? 'Credit = sales invoices and cash received at the counter; Debit = purchases, outsourced jobs and expenses. The balance runs from the first line of the period.'
          : 'Credit = money received (customer payments, cash receipts); Debit = money paid out (purchase and outsource payments, expenses). The balance runs from the first line of the period.'}
      </Typography>
    </Box>
  );
}

function PeriodRows({ period }: { period: import('../../types/reports').LedgerPeriod }) {
  return (
    <>
      <TableRow sx={{ bgcolor: '#f3f4fb' }} data-testid="ledger-period">
        <TableCell colSpan={7} sx={{ fontWeight: 800 }}>
          {period.label}
          <Chip size="small" label={period.summary} sx={{ ml: 1.5, fontWeight: 500 }} />
        </TableCell>
      </TableRow>
      {period.entries.map((e) => (
        <TableRow key={e.sr} hover data-testid="ledger-row">
          <TableCell>{e.sr}</TableCell>
          <TableCell sx={{ whiteSpace: 'nowrap' }}>{dmy(e.date)}</TableCell>
          <TableCell>{e.particulars}</TableCell>
          <TableCell sx={{ whiteSpace: 'nowrap' }}>{e.ref || '-'}</TableCell>
          <TableCell align="right" sx={{ color: e.debit ? '#c62828' : 'text.disabled' }}>{e.debit ? rupees(e.debit) : '-'}</TableCell>
          <TableCell align="right" sx={{ color: e.credit ? '#00695c' : 'text.disabled' }}>{e.credit ? rupees(e.credit) : '-'}</TableCell>
          <TableCell align="right">{rupees(e.balance)}</TableCell>
        </TableRow>
      ))}
      <TableRow sx={{ '& td': { fontWeight: 700, borderTop: '1px solid #c5cae9' } }}>
        <TableCell colSpan={4} align="right">Total for {period.label}</TableCell>
        <TableCell align="right">{rupees(period.debit)}</TableCell>
        <TableCell align="right">{rupees(period.credit)}</TableCell>
        <TableCell align="right">{rupees(period.closing)}</TableCell>
      </TableRow>
    </>
  );
}
