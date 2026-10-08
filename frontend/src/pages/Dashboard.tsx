import { Box, Typography, Paper, Grid } from '@mui/material';
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

  const customers = useQuery({
    queryKey: ['customers'],
    queryFn: customersApi.list,
  });

  const quotations = useQuery({
    queryKey: ['quotations'],
    queryFn: quotationsApi.list,
  });

  const jobCards = useQuery({
    queryKey: ['job-cards'],
    queryFn: jobCardsApi.list,
  });

  const invoices = useQuery({
    queryKey: ['invoices'],
    queryFn: invoicesApi.list,
  });

  const cards = [
    {
      label: 'Customers',
      value: customers.data?.length ?? 0,
      color: '#1a237e',
      path: '/customers',
      icon: PeopleIcon,
    },
    {
      label: 'Quotations',
      value: quotations.data?.length ?? 0,
      color: '#1565c0',
      path: '/quotations',
      icon: DescriptionIcon,
    },
    {
      label: 'Job Cards',
      value: jobCards.data?.length ?? 0,
      color: '#0277bd',
      path: '/job-cards',
      icon: WorkIcon,
    },
    {
      label: 'Invoices',
      value: invoices.data?.length ?? 0,
      color: '#00695c',
      path: '/invoices',
      icon: ReceiptIcon,
    },
  ];

  return (
    <Box
      sx={{
        width: '100%',
        minHeight: '100vh',
        backgroundColor: '#f6f8fc',
        boxSizing: 'border-box',
        p: {
          xs: 2,
          sm: 2.5,
          md: 3,
          lg: 4,
        },
      }}
    >
      {/* Page Header */}
      <Box
        sx={{
          mb: 3,
          px: {
            xs: 0,
            md: 0.5,
          },
        }}
      >
        <Typography
          variant="h5"
          sx={{
            fontWeight: 800,
            color: '#1a237e',
            letterSpacing: '-0.3px',
          }}
        >
          Overview
        </Typography>

        <Typography
          variant="body2"
          sx={{
            color: '#6b7280',
            mt: 0.5,
          }}
        >
          Manage your orders, customers, quotations and invoices
        </Typography>
      </Box>

      {/* Main Dashboard Layout */}
      <Grid
        container
        spacing={{
          xs: 2,
          md: 3,
          lg: 4,
        }}
        sx={{
          width: '100%',
          m: 0,
          '& > .MuiGrid-root': {
            minWidth: 0,
          },
        }}
      >
        {/* =========================
            LEFT - START NEW ORDER
           ========================= */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Box
            sx={{
              width: '100%',
              height: '100%',
              minWidth: 0,
            }}
          >
            <QuickOrderForm />
          </Box>
        </Grid>

        {/* =========================
            RIGHT - DASHBOARD
           ========================= */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Box
            sx={{
              width: '100%',
              minWidth: 0,
            }}
          >
            {/* Statistics Cards */}
            <Grid
              container
              spacing={2.5}
              sx={{
                mb: 3,
              }}
            >
              {cards.map((card) => {
                const Icon = card.icon;

                return (
                  <Grid
                    size={{ xs: 12, sm: 6 }}
                    key={card.label}
                  >
                    <Paper
                      sx={{
                        p: {
                          xs: 2.5,
                          md: 3,
                        },
                        minHeight: 135,
                        borderRadius: 3,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        boxSizing: 'border-box',

                        backgroundColor: '#ffffff',

                        boxShadow:
                          '0 4px 20px rgba(15, 23, 42, 0.05)',

                        border: '1px solid #e5e7eb',

                        cursor: 'pointer',

                        transition:
                          'transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease',

                        '&:hover': {
                          boxShadow:
                            '0 10px 30px rgba(15, 23, 42, 0.10)',
                          transform: 'translateY(-3px)',
                          borderColor: card.color,
                        },
                      }}
                      onClick={() => navigate(card.path)}
                    >
                      <Box>
                        <Typography
                          color="text.secondary"
                          variant="body2"
                          sx={{
                            fontWeight: 600,
                            mb: 0.75,
                            color: '#6b7280',
                          }}
                        >
                          {card.label}
                        </Typography>

                        <Typography
                          variant="h4"
                          sx={{
                            fontWeight: 800,
                            color: card.color,
                            lineHeight: 1.1,
                          }}
                        >
                          {card.value}
                        </Typography>
                      </Box>

                      <Box
                        sx={{
                          width: 52,
                          height: 52,
                          flexShrink: 0,
                          backgroundColor: `${card.color}15`,
                          color: card.color,
                          borderRadius: 2.5,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Icon sx={{ fontSize: 28 }} />
                      </Box>
                    </Paper>
                  </Grid>
                );
              })}
            </Grid>

            {/* Live Job Status */}
            <LiveJobStatusBoard />
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
}