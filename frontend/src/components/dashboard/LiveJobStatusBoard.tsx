import { useQuery } from '@tanstack/react-query';
import { Box, Typography, Paper, Chip, Stack, CircularProgress } from '@mui/material';
import { jobCardsApi } from '../../api/jobCardsApi';
import { customersApi } from '../../api/customersApi';
import { productsApi } from '../../api/productsApi';
import { isOverdue } from '../../utils/jobCards';
import type { JobCard } from '../../types/jobCards';

const IN_PROGRESS_STATUSES = ['design', 'approval', 'printing', 'binding', 'packing'];

function JobChip({ jobCard, label }: { jobCard: JobCard; label: string }) {
  const overdue = isOverdue(jobCard);
  return (
    <Chip
      label={label}
      size="small"
      color={overdue ? 'error' : 'default'}
      sx={
        overdue
          ? {
              animation: 'pulse 1.2s ease-in-out infinite',
              '@keyframes pulse': {
                '0%': { opacity: 1 },
                '50%': { opacity: 0.4 },
                '100%': { opacity: 1 },
              },
            }
          : undefined
      }
    />
  );
}

export default function LiveJobStatusBoard() {
  const jobCardsQuery = useQuery({ queryKey: ['job-cards'], queryFn: jobCardsApi.list });
  const customersQuery = useQuery({ queryKey: ['customers'], queryFn: customersApi.list });
  const productsQuery = useQuery({ queryKey: ['products'], queryFn: productsApi.list });

  const customerName = (id: number) => customersQuery.data?.find((c) => c.id === id)?.name ?? `#${id}`;
  const productName = (id: number) => productsQuery.data?.find((p) => p.id === id)?.name ?? `#${id}`;
  const jobLabel = (jc: JobCard) => `${jc.job_number} — ${customerName(jc.customer_id)} (${productName(jc.product_id)})`;

  const jobCards = jobCardsQuery.data ?? [];
  const pending = jobCards.filter((jc) => jc.status === 'pending');
  const inProgress = jobCards.filter((jc) => IN_PROGRESS_STATUSES.includes(jc.status));
  const delivered = jobCards.filter((jc) => jc.status === 'delivered');
  const overdueCount = jobCards.filter(isOverdue).length;

  return (
    <Paper sx={{ p: 3, borderRadius: 2 }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
          Live Job Status
        </Typography>
        {overdueCount > 0 && (
          <Chip
            label={`${overdueCount} overdue`}
            color="error"
            size="small"
            sx={{
              animation: 'pulse 1.2s ease-in-out infinite',
              '@keyframes pulse': { '0%': { opacity: 1 }, '50%': { opacity: 0.4 }, '100%': { opacity: 1 } },
            }}
          />
        )}
      </Stack>

      {jobCardsQuery.isLoading ? (
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <CircularProgress />
        </Box>
      ) : (
        <Stack spacing={2}>
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Pending ({pending.length})
            </Typography>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
              {pending.map((jc) => <JobChip key={jc.id} jobCard={jc} label={jobLabel(jc)} />)}
              {pending.length === 0 && <Typography variant="body2" color="text.secondary">None</Typography>}
            </Stack>
          </Box>
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              In Progress ({inProgress.length})
            </Typography>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
              {inProgress.map((jc) => <JobChip key={jc.id} jobCard={jc} label={`${jobLabel(jc)} · ${jc.status}`} />)}
              {inProgress.length === 0 && <Typography variant="body2" color="text.secondary">None</Typography>}
            </Stack>
          </Box>
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Delivered ({delivered.length})
            </Typography>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
              {delivered.slice(0, 10).map((jc) => (
                <Chip key={jc.id} label={jobLabel(jc)} size="small" color="success" variant="outlined" />
              ))}
              {delivered.length === 0 && <Typography variant="body2" color="text.secondary">None</Typography>}
            </Stack>
          </Box>
        </Stack>
      )}
    </Paper>
  );
}
