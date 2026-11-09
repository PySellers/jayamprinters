import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Alert, Box, Button, Chip, Divider, Grid, Paper, Stack, TextField, Typography } from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import LockResetIcon from '@mui/icons-material/LockReset';
import { accountApi } from '../api/accountApi';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../utils/api';

const ROLE_HINT: Record<string, string> = {
  admin: 'Full access: pricing, users, reports and AI Insights.',
  counter: 'Takes orders, makes invoices, records payments and supervises the jobs.',
  production: 'Works the job steps: take a task, start it, finish it.',
  accounts: 'Cash ledger, purchases and payments.',
};

/** Edit my own profile: name, phone and password. E-mail and role stay with the admin. */
export default function Profile() {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const [passwordNote, setPasswordNote] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => accountApi.updateProfile({ name: name.trim(), phone: phone.trim() || null }),
    onSuccess: (data) => {
      updateUser({ name: data.name, phone: data.phone ?? null });
      setSaved('Your profile is saved.');
    },
  });
  const change = useMutation({
    mutationFn: () => accountApi.changePassword(current, next),
    onSuccess: () => {
      setCurrent(''); setNext(''); setAgain('');
      setPasswordNote('Your password was changed. Use the new one the next time you sign in.');
    },
  });

  const mismatch = again !== '' && next !== again;
  const profileChanged = name.trim() !== (user?.name ?? '') || phone.trim() !== (user?.phone ?? '');

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 900 }}>
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 2 }}>Edit profile</Typography>

      <Paper sx={{ p: 2.5, borderRadius: 2, mb: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>Your details</Typography>
        {saved && <Alert severity="success" sx={{ mb: 1.5 }} onClose={() => setSaved(null)}>{saved}</Alert>}
        {save.isError && <Alert severity="error" sx={{ mb: 1.5 }}>{getErrorMessage(save.error, 'Could not save your profile')}</Alert>}
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField label="Name" fullWidth value={name} onChange={(e) => { setSaved(null); setName(e.target.value); }} slotProps={{ htmlInput: { 'data-testid': 'profile-name' } }} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField label="Phone number" fullWidth value={phone} onChange={(e) => { setSaved(null); setPhone(e.target.value); }}
              helperText="Shown to your colleagues on the Contacts page." slotProps={{ htmlInput: { 'data-testid': 'profile-phone' } }} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField label="Login e-mail" fullWidth value={user?.email ?? ''} disabled helperText="Only the admin can change this." />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Stack sx={{ height: '100%', justifyContent: 'center' }} spacing={0.5}>
              <Box><Typography variant="caption" color="text.secondary">Your role</Typography></Box>
              <Box><Chip label={(user?.role ?? '').toUpperCase()} color={user?.role === 'admin' ? 'error' : 'primary'} size="small" /></Box>
              <Typography variant="caption" color="text.secondary">{ROLE_HINT[user?.role ?? ''] ?? ''}</Typography>
            </Stack>
          </Grid>
        </Grid>
        <Box sx={{ mt: 2 }}>
          <Button variant="contained" startIcon={<SaveIcon />} sx={{ bgcolor: '#1a237e' }} disabled={!name.trim() || !profileChanged || save.isPending} onClick={() => save.mutate()} data-testid="profile-save">
            Save profile
          </Button>
        </Box>
      </Paper>

      <Paper sx={{ p: 2.5, borderRadius: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>Change password</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>At least 6 characters. You stay signed in on this computer.</Typography>
        {passwordNote && <Alert severity="success" sx={{ mb: 1.5 }} onClose={() => setPasswordNote(null)}>{passwordNote}</Alert>}
        {change.isError && <Alert severity="error" sx={{ mb: 1.5 }}>{getErrorMessage(change.error, 'Could not change the password')}</Alert>}
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField label="Current password" type="password" fullWidth autoComplete="current-password" value={current} onChange={(e) => { setPasswordNote(null); setCurrent(e.target.value); }} slotProps={{ htmlInput: { 'data-testid': 'pw-current' } }} />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField label="New password" type="password" fullWidth autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} slotProps={{ htmlInput: { 'data-testid': 'pw-new' } }} />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField label="Type the new password again" type="password" fullWidth autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} error={mismatch} helperText={mismatch ? 'The two do not match' : ' '} slotProps={{ htmlInput: { 'data-testid': 'pw-again' } }} />
          </Grid>
        </Grid>
        <Divider sx={{ my: 1.5 }} />
        <Button variant="outlined" startIcon={<LockResetIcon />} disabled={!current || next.length < 6 || next !== again || change.isPending} onClick={() => change.mutate()} data-testid="pw-save">
          Change password
        </Button>
      </Paper>
    </Box>
  );
}
