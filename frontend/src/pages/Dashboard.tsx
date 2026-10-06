import { Box, Typography, Paper, Grid } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { customersApi } from '../api/customersApi';
import { quotationsApi } from '../api/quotationsApi';
import { jobCardsApi } from '../api/jobCardsApi';
import { invoicesApi } from '../api/invoicesApi';
import QuickOrderForm from '../components/dashboard/QuickOrderForm';
import LiveJobStatusBoard from '../components/dashboard/LiveJobStatusBoard';

export default function Dashboard() {
  const navigate = useNavigate();

  const customers = useQuery({ queryKey: ['customers'], queryFn: customersApi.list });
  const quotations = useQuery({ queryKey: ['quotations'], queryFn: quotationsApi.list });
  const jobCards = useQuery({ queryKey: ['job-cards'], queryFn: jobCardsApi.list });
  const invoices = useQuery({ queryKey: ['invoices'], queryFn: invoicesApi.list });

  const cards = [
    { label: 'Customers', value: customers.data?.length ?? 0, color: '#1a237e', path: '/customers' },
    { label: 'Quotations', value: quotations.data?.length ?? 0, color: '#1565c0', path: '/quotations' },
    { label: 'Job Cards', value: jobCards.data?.length ?? 0, color: '#0277bd', path: '/job-cards' },
    { label: 'Invoices', value: invoices.data?.length ?? 0, color: '#00695c', path: '/invoices' },
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
                  <Typography variant="h3" sx={{ fontWeight: 'bold' }} color={card.color}>
                    {card.value}
                  </Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>

          <LiveJobStatusBoard />
        </Grid>
      </Grid>
    </Box>
  );
}
