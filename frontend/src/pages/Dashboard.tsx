import { Box, Typography, Paper, Grid, List, ListItemButton, ListItemText, Chip } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { customersApi } from '../api/customersApi';
import { quotationsApi } from '../api/quotationsApi';
import { jobCardsApi } from '../api/jobCardsApi';
import { invoicesApi } from '../api/invoicesApi';
import { isOverdue } from '../utils/jobCards';
import QuickOrderForm from '../components/dashboard/QuickOrderForm';
import LiveJobStatusBoard from '../components/dashboard/LiveJobStatusBoard';

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function Dashboard() {
  const navigate = useNavigate();

  const customers = useQuery({ queryKey: ['customers'], queryFn: customersApi.list });
  const quotations = useQuery({ queryKey: ['quotations'], queryFn: quotationsApi.list });
  const jobCards = useQuery({ queryKey: ['job-cards'], queryFn: jobCardsApi.list });
  const invoices = useQuery({ queryKey: ['invoices'], queryFn: invoicesApi.list });

  const todayStr = todayDateString();
  const todaysSales = (invoices.data ?? [])
    .filter((inv) => inv.invoice_date === todayStr)
    .reduce((sum, inv) => sum + inv.grand_total, 0);
  const pendingJobs = (jobCards.data ?? []).filter((jc) => jc.status !== 'delivered').length;
  const overdueJobs = (jobCards.data ?? []).filter(isOverdue).length;

  const paymentsDue = (invoices.data ?? [])
    .filter((inv) => inv.status !== 'paid')
    .map((inv) => ({ ...inv, balance: inv.grand_total - inv.amount_paid }))
    .sort((a, b) => a.invoice_date.localeCompare(b.invoice_date))
    .slice(0, 8);

  const cards = [
    { label: "Today's Sales", value: `₹${todaysSales.toFixed(2)}`, color: '#1a237e', path: '/reports' },
    { label: 'Pending Jobs', value: pendingJobs, color: '#0277bd', path: '/job-cards' },
    {
      label: 'Overdue Jobs',
      value: overdueJobs,
      color: overdueJobs > 0 ? '#c62828' : '#2e7d32',
      path: '/job-cards',
    },
    { label: 'Customers', value: customers.data?.length ?? 0, color: '#00695c', path: '/customers' },
    { label: 'Quotations', value: quotations.data?.length ?? 0, color: '#1565c0', path: '/quotations' },
    { label: 'Invoices', value: invoices.data?.length ?? 0, color: '#6a1b9a', path: '/invoices' },
  ];

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ fontWeight: 'bold', mb: 3 }}>
        Overview
      </Typography>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 5 }}>
          <QuickOrderForm />
        </Grid>

        <Grid size={{ xs: 12, md: 7 }}>
          <Grid container spacing={3} sx={{ mb: 3 }}>
            {cards.map((card) => (
              <Grid size={{ xs: 12, sm: 6 }} key={card.label}>
                <Paper
                  sx={{
                    p: 3,
                    borderRadius: 2,
                    borderTop: `4px solid ${card.color}`,
                    cursor: 'pointer',
                    '&:hover': { boxShadow: 4 },
                  }}
                  onClick={() => navigate(card.path)}
                >
                  <Typography color="text.secondary" variant="body2">
                    {card.label}
                  </Typography>
                  <Typography variant="h3" sx={{ fontWeight: 'bold', wordBreak: 'break-word' }} color={card.color}>
                    {card.value}
                  </Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>

          <LiveJobStatusBoard />

          <Paper sx={{ borderRadius: 2, mt: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold', p: 2, pb: 1 }}>
              Payments Due
            </Typography>
            <List dense disablePadding>
              {paymentsDue.map((inv) => (
                <ListItemButton key={inv.id} onClick={() => navigate(`/invoices/${inv.id}`)}>
                  <ListItemText
                    primary={`${inv.invoice_number} — ₹${inv.balance.toFixed(2)}`}
                    secondary={`Invoiced ${inv.invoice_date}`}
                  />
                  <Chip
                    label={inv.status.replace('_', ' ')}
                    size="small"
                    color={inv.status === 'partially_paid' ? 'warning' : 'default'}
                  />
                </ListItemButton>
              ))}
              {paymentsDue.length === 0 && (
                <Typography color="text.secondary" variant="body2" sx={{ p: 2, pt: 0 }}>
                  Nothing outstanding.
                </Typography>
              )}
            </List>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
