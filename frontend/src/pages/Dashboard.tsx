import { Box, Typography, Grid, ButtonBase } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import PeopleIcon from '@mui/icons-material/People';
import DescriptionIcon from '@mui/icons-material/Description';
import WorkIcon from '@mui/icons-material/Work';
import ReceiptIcon from '@mui/icons-material/Receipt';

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
  const jobCards = useQuery({ queryKey: ['job-cards'], queryFn: jobCardsApi.list, refetchInterval: 20000 });
  const invoices = useQuery({ queryKey: ['invoices'], queryFn: invoicesApi.list });

  const cards = [
    { label: 'Customers', value: customers.data?.length ?? 0, color: '#1a237e', path: '/customers', icon: PeopleIcon },
    { label: 'Quotations', value: quotations.data?.length ?? 0, color: '#1565c0', path: '/quotations', icon: DescriptionIcon },
    { label: 'Job Cards', value: jobCards.data?.length ?? 0, color: '#0277bd', path: '/job-cards', icon: WorkIcon },
    { label: 'Invoices', value: invoices.data?.length ?? 0, color: '#00695c', path: '/invoices', icon: ReceiptIcon },
  ];

  return (
    <Box sx={{ width: '100%', backgroundColor: '#f6f8fc', boxSizing: 'border-box', p: { xs: 1.5, sm: 2, md: 2.5 } }}>
      {/* the headline numbers: one slim strip, so the jobs below get the room */}
      <Grid container spacing={1.25} sx={{ mb: 1.75 }} data-testid="stat-strip">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Grid size={{ xs: 6, sm: 3 }} key={card.label}>
              {/* a light-blue button: click to open the list; kept slim so the jobs below get the room */}
              <ButtonBase
                onClick={() => navigate(card.path)}
                aria-label={`${card.label}: ${card.value}`}
                data-testid={`stat-${card.label.toLowerCase().replace(/\s+/g, '-')}`}
                sx={{
                  width: '100%', justifyContent: 'flex-start', px: 1.5, py: 0.35, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 1.25,
                  bgcolor: '#e3f2fd', border: '1px solid #bbdefb', transition: 'background-color .15s, box-shadow .15s, border-color .15s',
                  '&:hover': { bgcolor: '#d2e9fb', borderColor: card.color, boxShadow: '0 2px 8px rgba(21,101,192,0.18)' },
                  '&:focus-visible': { outline: `2px solid ${card.color}`, outlineOffset: 2 },
                }}
              >
                <Box sx={{ width: 26, height: 26, borderRadius: 1.5, bgcolor: '#ffffffb3', color: card.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon sx={{ fontSize: 16 }} />
                </Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 800, color: card.color, lineHeight: 1 }}>{card.value}</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: '#37474f' }} noWrap>{card.label}</Typography>
              </ButtonBase>
            </Grid>
          );
        })}
      </Grid>

      <Grid container spacing={{ xs: 1.5, md: 2 }} sx={{ width: '100%', m: 0, '& > .MuiGrid-root': { minWidth: 0 } }}>
        {/* the running jobs and their status come first on the page */}
        <Grid size={{ xs: 12, lg: 7 }} sx={{ order: { xs: 1, lg: 2 } }}>
          <LiveJobStatusBoard />
        </Grid>
        <Grid size={{ xs: 12, lg: 5 }} sx={{ order: { xs: 2, lg: 1 } }}>
          <QuickOrderForm />
        </Grid>
      </Grid>
    </Box>
  );
}
