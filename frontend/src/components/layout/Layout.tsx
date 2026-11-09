import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Box, AppBar, Toolbar, Typography, IconButton, Avatar, Menu, MenuItem, Divider,
  Badge, Drawer, List, ListItem, ListItemIcon,
  ListItemText, ListItemButton, Collapse, useMediaQuery, useTheme,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import LogoutIcon from '@mui/icons-material/Logout';
import PersonIcon from '@mui/icons-material/Person';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import ContactsIcon from '@mui/icons-material/Contacts';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import TuneIcon from '@mui/icons-material/Tune';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useAuth } from '../../context/AuthContext';
import { mainNavItems, mastersNavItems } from './navConfig';
import { workflowApi } from '../../api/workflowApi';
import logo from '../../assets/sjp-logo.png';

const SIDEBAR_WIDTH = 260;
const FIRST_YEAR = 2026;
const initials = (name?: string) => (name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  // Below 1200px (laptops at 125-150% display scaling, tablets) the sidebar becomes a slide-out menu
  // so the page gets the full width instead of losing 260px to a permanent sidebar.
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('lg'));
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileAnchor, setProfileAnchor] = useState<HTMLElement | null>(null);
  const [mastersOpen, setMastersOpen] = useState(location.pathname.startsWith('/masters') || location.pathname === '/taxes');

  // number of open tasks waiting for this employee (refreshes every 30 s)
  const myWork = useQuery({ queryKey: ['my-work-count'], queryFn: workflowApi.myWork, refetchInterval: 30000, enabled: Boolean(user) });
  const badgeCount = myWork.data?.count ?? 0;

  const canSee = (roles?: string[]) => !roles || roles.length === 0 || user?.role === 'admin' || roles.includes(user?.role ?? '');
  const visibleMainNav = mainNavItems.filter((item) => canSee(item.roles));
  const visibleMastersNav = mastersNavItems.filter((item) => canSee(item.roles));

  const isActive = (path: string) => location.pathname === path;
  const openProfilePage = (path: string) => {
    setProfileAnchor(null);
    navigate(path);
  };
  const year = new Date().getFullYear();
  const go = (path: string) => {
    navigate(path);
    setMenuOpen(false);
  };
  // Exact match first, then the longest section prefix (so /quotations/new still says "Quotations").
  const navAll = [...mainNavItems, ...mastersNavItems];
  const EXTRA_TITLES: Record<string, string> = { '/profile': 'Edit profile', '/manual': 'Manual', '/contacts': 'Contacts', '/about': 'About' };
  const activeLabel =
    EXTRA_TITLES[location.pathname] ||
    navAll.find((item) => isActive(item.path))?.label ||
    [...navAll].filter((item) => item.path !== '/' && location.pathname.startsWith(`${item.path}/`)).sort((a, b) => b.path.length - a.path.length)[0]?.label ||
    'Dashboard';

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Drawer
        variant={isDesktop ? 'permanent' : 'temporary'}
        open={isDesktop || menuOpen}
        onClose={() => setMenuOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          width: isDesktop ? SIDEBAR_WIDTH : 0,
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
          {/* the logo sits on a white badge so its black letters stay readable on the dark sidebar */}
          <Box sx={{ bgcolor: '#fff', borderRadius: 2, p: 0.75, display: 'inline-flex', mb: 0.5 }}>
            <Box component="img" src={logo} alt="Sri Jayam Printers" data-testid="brand-logo" sx={{ height: 64, width: 'auto', display: 'block' }} />
          </Box>
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
                onClick={() => go(item.path)}
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
                {item.badge === 'myWork' && badgeCount > 0 && <Badge badgeContent={badgeCount} color="error" max={99} sx={{ mr: 1.5 }} data-testid="my-work-badge" />}
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
                    onClick={() => go(item.path)}
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

      <Box sx={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <AppBar position="static" sx={{ bgcolor: '#283593' }}>
          <Toolbar>
            {!isDesktop && (
              <IconButton color="inherit" edge="start" aria-label="Open menu" onClick={() => setMenuOpen(true)} sx={{ mr: 1.5 }}>
                <MenuIcon />
              </IconButton>
            )}
            <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>
              {activeLabel}
            </Typography>
            <Typography noWrap sx={{ mr: 1.5, display: { xs: 'none', sm: 'block' } }}>Welcome, {user?.name}</Typography>
            <IconButton color="inherit" aria-label="Profile menu" data-testid="profile-menu-button" onClick={(e) => setProfileAnchor(e.currentTarget)} sx={{ p: 0.5 }}>
              <Avatar sx={{ width: 34, height: 34, bgcolor: '#fff', color: '#283593', fontSize: 14, fontWeight: 800 }}>{initials(user?.name)}</Avatar>
            </IconButton>
            <Menu
              anchorEl={profileAnchor}
              open={Boolean(profileAnchor)}
              onClose={() => setProfileAnchor(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              slotProps={{ paper: { sx: { minWidth: 230, mt: 0.5 } } }}
            >
              <Box sx={{ px: 2, py: 1 }}>
                <Typography sx={{ fontWeight: 700 }} noWrap>{user?.name}</Typography>
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{user?.email}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'capitalize' }}>{user?.role}</Typography>
              </Box>
              <Divider />
              <MenuItem onClick={() => openProfilePage('/profile')}><ListItemIcon><PersonIcon fontSize="small" /></ListItemIcon>Edit profile</MenuItem>
              <MenuItem onClick={() => openProfilePage('/manual')}><ListItemIcon><MenuBookIcon fontSize="small" /></ListItemIcon>Manual</MenuItem>
              <MenuItem onClick={() => openProfilePage('/contacts')}><ListItemIcon><ContactsIcon fontSize="small" /></ListItemIcon>Contacts</MenuItem>
              <MenuItem onClick={() => openProfilePage('/about')}><ListItemIcon><InfoOutlinedIcon fontSize="small" /></ListItemIcon>About</MenuItem>
              <Divider />
              <MenuItem onClick={() => { setProfileAnchor(null); logout(); }}><ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>Logout</MenuItem>
            </Menu>
          </Toolbar>
        </AppBar>

        <Box sx={{ flexGrow: 1, minWidth: 0, bgcolor: '#f5f5f5', overflowX: 'auto' }}>
          <Outlet />
        </Box>

        <Box component="footer" data-testid="app-footer" sx={{ bgcolor: '#e8eaf6', borderTop: '1px solid #c5cae9', py: 0.5, px: 2, textAlign: 'center' }}>
          <Typography sx={{ fontSize: 12, color: '#37474f', lineHeight: 1.5 }}>
            &copy; {FIRST_YEAR}{year > FIRST_YEAR ? `–${year}` : ''} Sri Jayam Printers. All rights reserved. &nbsp;|&nbsp; Developed by PySellers Services Pvt Ltd, 8838587824
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
