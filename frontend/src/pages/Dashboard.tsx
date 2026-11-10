import { useState } from 'react';
import { Box, Typography, Grid, ButtonBase } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';

import DescriptionIcon from '@mui/icons-material/Description';
import WorkIcon from '@mui/icons-material/Work';
import ReceiptIcon from '@mui/icons-material/Receipt';
import SensorsIcon from '@mui/icons-material/Sensors';
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart';

import { quotationsApi } from '../api/quotationsApi';
import { jobCardsApi } from '../api/jobCardsApi';
import { invoicesApi } from '../api/invoicesApi';

import QuickOrderForm from '../components/dashboard/QuickOrderForm';
import LiveJobStatusBoard from '../components/dashboard/LiveJobStatusBoard';
import DashboardAlerts from '../components/dashboard/DashboardAlerts';

/**
 * The home page shows ONE of two things: the order form (Start New Order) or the Live Jobs board. The big red button in the
 * top strip switches between them: "Live Jobs" while the order form is showing, "Order online" while the jobs are.
 */
export default function Dashboard() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [view, setView] = useState<'order' | 'live'>(params.get('view') === 'live' ? 'live' : 'order');

  const quotations = useQuery({ queryKey: ['quotations'], queryFn: quotationsApi.list });
  const jobCards = useQuery({ queryKey: ['job-cards'], queryFn: jobCardsApi.list, refetchInterval: 20000 });
  const invoices = useQuery({ queryKey: ['invoices'], queryFn: invoicesApi.list });
  const running = (jobCards.data ?? []).filter((j) => j.status !== 'delivered').length;

  const cards = [
    { label: 'Quotations', value: quotations.data?.length ?? 0, color: '#1565c0', path: '/quotations', icon: DescriptionIcon },
    { label: 'Job Cards', value: jobCards.data?.length ?? 0, color: '#0277bd', path: '/job-cards', icon: WorkIcon },
    { label: 'Invoices', value: invoices.data?.length ?? 0, color: '#00695c', path: '/invoices', icon: ReceiptIcon },
  ];
  const live = view === 'live';

  return (
    <Box sx={{ width: '100%', backgroundColor: '#f6f8fc', boxSizing: 'border-box', p: { xs: 1.5, sm: 2, md: 2.5 } }}>
      <Grid container spacing={1.25} sx={{ mb: 1.75 }} data-testid="stat-strip">
        {/* the big red switch between the order form and the live jobs */}
        <Grid size={{ xs: 12, sm: 3 }}>
          <ButtonBase
            onClick={() => setView(live ? 'order' : 'live')}
            aria-label={live ? 'Order online' : `Live Jobs: ${running} running`}
            aria-pressed={live}
            data-testid="live-switch"
            sx={{
              width: '100%', justifyContent: 'center', px: 1.5, py: 0.5, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 1,
              bgcolor: '#d32f2f', color: '#fff', border: '2px solid #b71c1c', boxShadow: '0 2px 10px rgba(211,47,47,0.45)',
              transition: 'background-color .15s, box-shadow .15s', '&:hover': { bgcolor: '#c62828', boxShadow: '0 3px 14px rgba(211,47,47,0.6)' },
              '&:focus-visible': { outline: '3px solid #ffcdd2', outlineOffset: 2 },
            }}
          >
            {live ? <AddShoppingCartIcon sx={{ fontSize: 20 }} /> : (
              <Box sx={{ position: 'relative', display: 'flex' }}>
                <SensorsIcon sx={{ fontSize: 20 }} />
              </Box>
            )}
            <Typography variant="subtitle1" sx={{ fontWeight: 900, lineHeight: 1, letterSpacing: 0.3 }}>
              {live ? 'Order online' : 'Live Jobs'}
            </Typography>
            {!live && (
              <Box sx={{ bgcolor: '#fff', color: '#b71c1c', borderRadius: 10, px: 1, fontWeight: 900, fontSize: 14, lineHeight: 1.5 }} data-testid="live-count">{running}</Box>
            )}
          </ButtonBase>
        </Grid>
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Grid size={{ xs: 6, sm: 3 }} key={card.label}>
              {/* a light-blue button: click to open the list; kept slim so the page below gets the room */}
              <ButtonBase
                onClick={() => navigate(card.path)}
                aria-label={`${card.label}: ${card.value}`}
                data-testid={`stat-${card.label.toLowerCase().replace(/\s+/g, '-')}`}
                sx={{
                  width: '100%', justifyContent: 'flex-start', px: 1.5, py: 0.35, minHeight: 38, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 1.25,
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

      {live ? (
        <Box data-testid="view-live"><LiveJobStatusBoard /></Box>
      ) : (
        <Box data-testid="view-order">
          <DashboardAlerts />
          <Box sx={{ maxWidth: 1180, mx: 'auto' }}>
            <QuickOrderForm />
          </Box>
        </Box>
      )}
    </Box>
  );
}
