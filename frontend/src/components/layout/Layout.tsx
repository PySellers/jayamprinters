import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Box, AppBar, Toolbar, Typography, Button,
  Drawer, List, ListItem, ListItemIcon,
  ListItemText, ListItemButton, Collapse,
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import LogoutIcon from '@mui/icons-material/Logout';
import TuneIcon from '@mui/icons-material/Tune';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useAuth } from '../../context/AuthContext';
import { mainNavItems, mastersNavItems } from './navConfig';

const SIDEBAR_WIDTH = 260;

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mastersOpen, setMastersOpen] = useState(location.pathname.startsWith('/masters') || location.pathname === '/taxes');

  const canSee = (roles?: string[]) => !roles || roles.length === 0 || user?.role === 'admin' || roles.includes(user?.role ?? '');
  const visibleMainNav = mainNavItems.filter((item) => canSee(item.roles));
  const visibleMastersNav = mastersNavItems.filter((item) => canSee(item.roles));

  const isActive = (path: string) => location.pathname === path;
  const activeLabel =
    [...mainNavItems, ...mastersNavItems].find((item) => isActive(item.path))?.label || 'Dashboard';

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Drawer
        variant="permanent"
        sx={{
          width: SIDEBAR_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: SIDEBAR_WIDTH,
            boxSizing: 'border-box',
            bgcolor: '#1a237e',
            color: 'white',
          },
        }}
      >
        <Box sx={{ p: 2.5, textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
          <PrintIcon sx={{ fontSize: 52 }} />
          <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.2, mt: 0.5 }}>
            Sri Jayam Printers
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.75, letterSpacing: 1 }}>
            ERP SYSTEM
          </Typography>
        </Box>

        <List sx={{ pt: 1, overflowY: 'auto' }}>
          {visibleMainNav.map((item) => (
            <ListItem key={item.path} disablePadding>
              <ListItemButton
                onClick={() => navigate(item.path)}
                sx={{
                  mx: 1,
                  borderRadius: 1,
                  mb: 0.5,
                  bgcolor: isActive(item.path) ? 'rgba(255,255,255,0.2)' : 'transparent',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
                }}
              >
                <ListItemIcon sx={{ color: 'white', minWidth: 40 }}>
                  <item.icon />
                </ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            </ListItem>
          ))}

          {visibleMastersNav.length > 0 && (
          <ListItem disablePadding>
            <ListItemButton
              onClick={() => setMastersOpen((prev) => !prev)}
              sx={{ mx: 1, borderRadius: 1, mb: 0.5, '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}
            >
              <ListItemIcon sx={{ color: 'white', minWidth: 40 }}>
                <TuneIcon />
              </ListItemIcon>
              <ListItemText primary="Masters" />
              {mastersOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </ListItemButton>
          </ListItem>
          )}
          <Collapse in={mastersOpen && visibleMastersNav.length > 0} timeout="auto" unmountOnExit>
            <List component="div" disablePadding>
              {visibleMastersNav.map((item) => (
                <ListItem key={item.path} disablePadding>
                  <ListItemButton
                    onClick={() => navigate(item.path)}
                    sx={{
                      mx: 1,
                      pl: 4,
                      borderRadius: 1,
                      mb: 0.5,
                      bgcolor: isActive(item.path) ? 'rgba(255,255,255,0.2)' : 'transparent',
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
                    }}
                  >
                    <ListItemText primary={item.label} slotProps={{ primary: { sx: { fontSize: 14 } } }} />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Collapse>
        </List>
      </Drawer>

      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        <AppBar position="static" sx={{ bgcolor: '#283593' }}>
          <Toolbar>
            <Typography variant="h6" sx={{ flexGrow: 1 }}>
              {activeLabel}
            </Typography>
            <Typography sx={{ mr: 2 }}>Welcome, {user?.name}</Typography>
            <Button color="inherit" onClick={logout} startIcon={<LogoutIcon />}>
              Logout
            </Button>
          </Toolbar>
        </AppBar>

        <Box sx={{ flexGrow: 1, bgcolor: '#f5f5f5' }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
