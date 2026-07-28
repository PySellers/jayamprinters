import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Box, AppBar, Toolbar, Typography, Button,
  Drawer, List, ListItem, ListItemIcon,
  ListItemText, ListItemButton, Paper, Grid
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import LogoutIcon from '@mui/icons-material/Logout';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PeopleIcon from '@mui/icons-material/People';
import Customers from '../pages/Customers';
import api from '../utils/api';

const SIDEBAR_WIDTH = 240;

const menuItems = [
  { label: 'Dashboard', icon: <DashboardIcon />, key: 'dashboard' },
  { label: 'Customers', icon: <PeopleIcon />, key: 'customers' },
];

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [activePage, setActivePage] = useState('dashboard');
  const [counts, setCounts] = useState({
    customers: 0, quotations: 0, jobcards: 0, invoices: 0
  });

  useEffect(() => {
    api.get('/customers/')
      .then(res => {
        setCounts(prev => ({ ...prev, customers: res.data.length }));
      })
      .catch(() => {});
  }, []);

  const cards = [
    { label: 'Customers', value: counts.customers, color: '#1a237e' },
    { label: 'Quotations', value: counts.quotations, color: '#1565c0' },
    { label: 'Job Cards', value: counts.jobcards, color: '#0277bd' },
    { label: 'Invoices', value: counts.invoices, color: '#00695c' },
  ];

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Drawer variant="permanent" sx={{
        width: SIDEBAR_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: SIDEBAR_WIDTH,
          boxSizing: 'border-box',
          bgcolor: '#1a237e',
          color: 'white'
        }
      }}>
        <Box sx={{
          p: 2, textAlign: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.2)'
        }}>
          <PrintIcon sx={{ fontSize: 40 }} />
          <Typography variant="subtitle1" fontWeight="bold">
            Sri Jayam Printers
          </Typography>
          <Typography variant="caption" sx={{ opacity: 0.7 }}>
            ERP System
          </Typography>
        </Box>

        <List sx={{ pt: 1 }}>
          {menuItems.map((item) => (
            <ListItem key={item.key} disablePadding>
              <ListItemButton
                onClick={() => setActivePage(item.key)}
                sx={{
                  mx: 1, borderRadius: 1, mb: 0.5,
                  bgcolor: activePage === item.key
                    ? 'rgba(255,255,255,0.2)'
                    : 'transparent',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }
                }}
              >
                <ListItemIcon sx={{ color: 'white', minWidth: 40 }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Drawer>

      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        <AppBar position="static" sx={{ bgcolor: '#283593' }}>
          <Toolbar>
            <Typography variant="h6" sx={{ flexGrow: 1 }}>
              {menuItems.find(m => m.key === activePage)?.label || 'Dashboard'}
            </Typography>
            <Typography sx={{ mr: 2 }}>Welcome, {user?.name}</Typography>
            <Button color="inherit" onClick={logout} startIcon={<LogoutIcon />}>
              Logout
            </Button>
          </Toolbar>
        </AppBar>

        <Box sx={{ p: 3, flexGrow: 1, bgcolor: '#f5f5f5' }}>
          {activePage === 'dashboard' && (
            <Box>
              <Typography variant="h5" fontWeight="bold" mb={3}>
                Overview
              </Typography>
              <Grid container spacing={3}>
                {cards.map((card) => (
                  <Grid item xs={12} sm={6} md={3} key={card.label}>
                    <Paper sx={{
                      p: 3, borderRadius: 2,
                      borderTop: `4px solid ${card.color}`,
                      cursor: 'pointer',
                      '&:hover': { boxShadow: 4 }
                    }}
                      onClick={() => {
                        if (card.label === 'Customers') setActivePage('customers');
                      }}
                    >
                      <Typography color="text.secondary" variant="body2">
                        {card.label}
                      </Typography>
                      <Typography variant="h3" fontWeight="bold" color={card.color}>
                        {card.value}
                      </Typography>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}

          {activePage === 'customers' && <Customers />}
        </Box>
      </Box>
    </Box>
  );
}
