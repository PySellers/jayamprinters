import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert, Box, Chip, CircularProgress, InputAdornment, Link, Paper, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { accountApi } from '../api/accountApi';
import { useAuth } from '../context/AuthContext';
import type { UserRole } from '../types/common';

const ROLE_LABEL: Record<UserRole, string> = { admin: 'Admin', counter: 'Counter', production: 'Production', accounts: 'Accounts' };
const ROLE_COLOR: Record<UserRole, 'error' | 'primary' | 'warning' | 'success'> = { admin: 'error', counter: 'primary', production: 'warning', accounts: 'success' };

/** Everyone who works here, Admin first, with a phone number to reach them. */
export default function Contacts() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const contacts = useQuery({ queryKey: ['contacts'], queryFn: accountApi.contacts });

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (contacts.data ?? []).filter((c) => !needle || `${c.name} ${c.email} ${c.phone ?? ''} ${c.role}`.toLowerCase().includes(needle));
  }, [contacts.data, search]);

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>Contacts</Typography>
          <Typography variant="body2" color="text.secondary">The Admin and every employee. Missing a number? Open the profile menu &rarr; Edit profile and add yours.</Typography>
        </Box>
        <TextField
          size="small" placeholder="Search name, role or number" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ width: 280 }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }, htmlInput: { 'data-testid': 'contacts-search' } }}
        />
      </Box>

      {contacts.isError && <Alert severity="error">Could not load the contacts.</Alert>}
      <Paper sx={{ borderRadius: 2, overflowX: 'auto' }}>
        {contacts.isLoading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>
        ) : (
          <Table size="small" data-testid="contacts-table">
            <TableHead>
              <TableRow><TableCell>Name</TableCell><TableCell>Role</TableCell><TableCell>Phone</TableCell><TableCell>E-mail</TableCell></TableRow>
            </TableHead>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id} hover data-testid="contact-row">
                  <TableCell sx={{ fontWeight: 700 }}>{c.name}{c.id === Number(user?.id) && <Chip label="You" size="small" sx={{ ml: 1 }} />}</TableCell>
                  <TableCell><Chip size="small" label={ROLE_LABEL[c.role] ?? c.role} color={ROLE_COLOR[c.role] ?? 'default'} /></TableCell>
                  <TableCell>{c.phone ? <Link href={`tel:${c.phone.replace(/\s+/g, '')}`} underline="hover">{c.phone}</Link> : <Typography component="span" color="text.disabled">not added</Typography>}</TableCell>
                  <TableCell><Link href={`mailto:${c.email}`} underline="hover">{c.email}</Link></TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && <TableRow><TableCell colSpan={4} align="center" sx={{ color: 'text.secondary', py: 3 }}>Nobody matches your search.</TableCell></TableRow>}
            </TableBody>
          </Table>
        )}
      </Paper>
    </Box>
  );
}
