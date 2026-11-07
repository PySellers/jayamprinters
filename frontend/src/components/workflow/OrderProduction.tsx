import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Box, Button, Chip, LinearProgress, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { jobCardsApi } from '../../api/jobCardsApi';
import { quotationsApi } from '../../api/quotationsApi';
import { productsApi } from '../../api/productsApi';

/** "Where is my order?": the production progress of every job card of one order, for the front desk to read out. */
export default function OrderProduction({ quotationId }: { quotationId: number }) {
  const navigate = useNavigate();
  const quotation = useQuery({ queryKey: ['quotations', quotationId], queryFn: () => quotationsApi.get(quotationId) });
  const jobs = useQuery({ queryKey: ['job-cards'], queryFn: jobCardsApi.list, refetchInterval: 30000 });
  const products = useQuery({ queryKey: ['products'], queryFn: productsApi.list });
  const itemIds = new Set((quotation.data?.items ?? []).map((i) => i.id));
  const mine = (jobs.data ?? []).filter((j) => j.quotation_item_id != null && itemIds.has(j.quotation_item_id));
  if (mine.length === 0) return null;
  const productName = (id: number) => products.data?.find((p) => p.id === id)?.name ?? `#${id}`;

  return (
    <Paper sx={{ borderRadius: 2, mb: 3 }} data-testid="order-production">
      <Typography variant="h6" sx={{ p: 2, pb: 0, fontWeight: 700 }}>Production status</Typography>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Job card</TableCell>
            <TableCell>Item</TableCell>
            <TableCell>Now with</TableCell>
            <TableCell sx={{ minWidth: 140 }}>Progress</TableCell>
            <TableCell align="right" />
          </TableRow>
        </TableHead>
        <TableBody>
          {mine.map((j) => (
            <TableRow key={j.id}>
              <TableCell>{j.job_number}</TableCell>
              <TableCell>{productName(j.product_id)}</TableCell>
              <TableCell>
                {j.status === 'delivered' ? (
                  <Chip size="small" color="success" label="Delivered" />
                ) : (
                  <>
                    <strong>{j.current_step ?? j.status}</strong>
                    {(j.current_assignee || j.current_work_center) && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{j.current_assignee ?? j.current_work_center}</Typography>}
                    {j.overdue && <Chip size="small" color="error" label="overdue" sx={{ ml: 0.5 }} />}
                  </>
                )}
              </TableCell>
              <TableCell>
                <Box>
                  <LinearProgress variant="determinate" value={j.steps_total ? (j.steps_done / j.steps_total) * 100 : 0} sx={{ height: 6, borderRadius: 3 }} />
                  <Typography variant="caption" color="text.secondary">{j.steps_done}/{j.steps_total} steps</Typography>
                </Box>
              </TableCell>
              <TableCell align="right"><Button size="small" onClick={() => navigate(`/job-cards/${j.id}/track`)}>Track</Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  );
}
