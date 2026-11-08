import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Box, Button, Chip, CircularProgress, FormControlLabel, Paper, Stack, Switch, Table, TableBody, TableCell,
  TableHead, TableRow, Typography,
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import PriorityHighIcon from '@mui/icons-material/PriorityHigh';
import PersonIcon from '@mui/icons-material/Person';
import CheckIcon from '@mui/icons-material/Check';
import { jobCardsApi } from '../../api/jobCardsApi';
import { getErrorMessage } from '../../utils/api';
import { PriceBreakdownTable } from '../quotations/PriceBreakdown';
import ProofsPanel from './ProofsPanel';

const STAGE_COLOR: Record<string, string> = {
  pending: '#757575', design: '#6a1b9a', approval: '#ef6c00', printing: '#1565c0', binding: '#00838f', packing: '#2e7d32', delivered: '#1b5e20',
};
const fmtDay = (d?: string | null) => (d ? new Date(`${d}T00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');

function Fact({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <Box sx={{ minWidth: 150 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{label}</Typography>
      <Typography sx={{ fontWeight: 700 }}>{value || '-'}</Typography>
    </Box>
  );
}

/**
 * The job card, built from the order: live status, every choice made for the job (all options, every copy's paper and
 * GSM, extras, notes), the proofs, who has it now - and Print buttons (with / without prices) that always print the
 * status as it is right now.
 */
export default function JobDetailPanel({ jobCardId, canEdit = true }: { jobCardId: number; canEdit?: boolean }) {
  const queryClient = useQueryClient();
  const [showPrice, setShowPrice] = useState(false);
  const detailQuery = useQuery({
    queryKey: ['job-card-detail', jobCardId],
    queryFn: () => jobCardsApi.detail(jobCardId, true),
    refetchInterval: 20000,
  });
  const printMutation = useMutation({ mutationFn: (withPrice: boolean) => jobCardsApi.printCard(jobCardId, withPrice) });
  const urgentMutation = useMutation({
    mutationFn: (urgent: boolean) => jobCardsApi.update(jobCardId, { priority: urgent ? 'urgent' : 'medium' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-card-detail', jobCardId] });
      queryClient.invalidateQueries({ queryKey: ['job-cards'] });
    },
  });

  if (detailQuery.isLoading) return <Box sx={{ p: 3, textAlign: 'center' }}><CircularProgress /></Box>;
  if (detailQuery.isError || !detailQuery.data) return <Alert severity="error">{getErrorMessage(detailQuery.error, 'Could not load the job details')}</Alert>;
  const d = detailQuery.data;
  const stageIndex = d.stages.findIndex((s) => s.key === d.status);
  const color = STAGE_COLOR[d.status] ?? '#757575';

  return (
    <Stack spacing={2} sx={{ mb: 3 }} data-testid="job-detail">
      {d.urgent && d.status !== 'delivered' && (
        <Box sx={{ bgcolor: '#c62828', color: '#fff', borderRadius: 2, py: 1, px: 2, display: 'flex', alignItems: 'center', gap: 1 }} data-testid="urgent-banner">
          <PriorityHighIcon />
          <Typography sx={{ fontWeight: 900, letterSpacing: 1.2 }}>URGENT - HANDLE THIS JOB FIRST</Typography>
        </Box>
      )}

      {/* live status */}
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, borderLeft: `6px solid ${color}` }}>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 1.25 }}>
          <Chip label={d.status_label} sx={{ bgcolor: color, color: '#fff', fontWeight: 800, fontSize: 15, height: 32 }} data-testid="detail-status" />
          {d.status !== 'delivered' && (
            <Typography variant="body2" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontWeight: 600 }}>
              <PersonIcon fontSize="small" /> Now with: {d.now_with.person ?? d.now_with.work_center ?? '-'}{d.now_with.step ? ` (${d.now_with.step})` : ''}
            </Typography>
          )}
          <Typography variant="body2" color="text.secondary">Steps done {d.progress.done} of {d.progress.total}</Typography>
          <Box sx={{ flexGrow: 1 }} />
          {canEdit && (
            <FormControlLabel
              control={<Switch color="error" checked={d.urgent} disabled={urgentMutation.isPending} onChange={(e) => urgentMutation.mutate(e.target.checked)} />}
              label={<Typography sx={{ fontWeight: d.urgent ? 900 : 500, color: d.urgent ? '#c62828' : 'inherit' }}>Urgent</Typography>}
            />
          )}
        </Stack>
        <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap' }} data-testid="detail-stages">
          {d.stages.map((s, i) => {
            const done = i < stageIndex;
            const current = i === stageIndex;
            const c = STAGE_COLOR[s.key];
            return (
              <Box key={s.key} sx={{
                display: 'flex', alignItems: 'center', gap: 0.25, px: 1, py: 0.25, borderRadius: 10, fontSize: 12.5, fontWeight: current ? 800 : 600,
                border: `1px solid ${current || done ? c : '#d0d4e4'}`, bgcolor: current ? c : done ? `${c}18` : 'transparent',
                color: current ? '#fff' : done ? c : '#9aa0b8',
              }}>
                {done && <CheckIcon sx={{ fontSize: 13 }} />}{s.label}
              </Box>
            );
          })}
        </Stack>
        <Stack direction="row" sx={{ gap: 3, flexWrap: 'wrap', mt: 1.75 }}>
          <Fact label="Customer" value={d.customer.name} />
          <Fact label="Phone" value={[d.customer.phone, d.customer.whatsapp].filter(Boolean).join(' / ')} />
          <Fact label="Service" value={d.job.service} />
          <Fact label="Item" value={d.job.item} />
          <Fact label="Quantity" value={d.job.quantity?.toLocaleString('en-IN')} />
          <Fact label="Delivery" value={`${fmtDay(d.delivery_date)}${d.delivery_time ? ` ${d.delivery_time}` : ''}${d.overdue ? ' (OVERDUE)' : ''}`} />
          <Fact label="Invoice" value={d.bill_no ?? d.invoice_number} />
        </Stack>
      </Paper>

      {/* everything chosen for the job */}
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#1a237e', mb: 1 }}>Specification</Typography>
        {d.specs.length > 0 && (
          <Table size="small" data-testid="detail-specs">
            <TableBody>
              {d.specs.map((s) => (
                <TableRow key={s.label}>
                  <TableCell sx={{ width: 220, color: 'text.secondary' }}>{s.label}</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>{s.value}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {d.copies.length > 0 && (
          <Box sx={{ mt: 1.5, overflowX: 'auto' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>Copies of the set ({d.copies.length})</Typography>
            <Table size="small" data-testid="detail-copies">
              <TableHead>
                <TableRow><TableCell>Copy</TableCell><TableCell>Paper name</TableCell><TableCell>GSM / grade</TableCell><TableCell>Paper size</TableCell><TableCell>Colour</TableCell></TableRow>
              </TableHead>
              <TableBody>
                {d.copies.map((c) => (
                  <TableRow key={c.copy}>
                    <TableCell sx={{ fontWeight: 700 }}>{c.copy}. {c.name}</TableCell>
                    <TableCell>{c.paper || '-'}</TableCell><TableCell>{c.gsm || '-'}</TableCell><TableCell>{c.size || '-'}</TableCell><TableCell>{c.colour || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
        {d.extras.length > 0 && (
          <Box sx={{ mt: 1.5 }} data-testid="detail-extras">
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>Finishing and extras</Typography>
            <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap' }}>
              {d.extras.map((e, i) => <Chip key={i} variant="outlined" label={`${e.group}: ${e.name}`} />)}
            </Stack>
          </Box>
        )}
        {d.notes.length > 0 && (
          <Box sx={{ mt: 1.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>Instructions / details</Typography>
            {d.notes.map((n, i) => <Typography key={i} variant="body2">• {n}</Typography>)}
          </Box>
        )}
        {d.specs.length === 0 && d.copies.length === 0 && d.extras.length === 0 && d.notes.length === 0 && (
          <Typography variant="body2" color="text.secondary">No further details were chosen for this job.</Typography>
        )}
      </Paper>

      <ProofsPanel jobCardId={jobCardId} canEdit={canEdit} />

      {/* price + printing */}
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#1a237e', flexGrow: 1 }}>Print this job card</Typography>
          <Button variant="contained" startIcon={<PrintIcon />} sx={{ bgcolor: '#1a237e' }} disabled={printMutation.isPending} onClick={() => printMutation.mutate(false)} data-testid="print-no-price">
            Print without price
          </Button>
          <Button variant="outlined" startIcon={<PrintIcon />} disabled={printMutation.isPending} onClick={() => printMutation.mutate(true)} data-testid="print-with-price">
            Print with price
          </Button>
        </Stack>
        <Typography variant="caption" color="text.secondary">The printout shows the status as it is right now, so print it again whenever it changes.</Typography>
        {printMutation.isError && <Alert severity="error" sx={{ mt: 1 }}>{getErrorMessage(printMutation.error, 'Could not open the job card')}</Alert>}
        {d.price && (
          <Box sx={{ mt: 1.5 }}>
            <FormControlLabel control={<Switch checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} />} label="Show the price details here" />
            {showPrice && (
              <Box sx={{ overflowX: 'auto' }} data-testid="detail-price">
                <Typography variant="body2" sx={{ mb: 0.75 }}>
                  Rate <strong>₹{d.price.rate.toFixed(2)}</strong> · Amount <strong>₹{d.price.amount.toFixed(2)}</strong>
                  {d.price.discount > 0 && ` · order discount share ₹${d.price.discount.toFixed(2)}`}
                </Typography>
                <PriceBreakdownTable rows={d.price.breakdown} />
              </Box>
            )}
          </Box>
        )}
      </Paper>
    </Stack>
  );
}
