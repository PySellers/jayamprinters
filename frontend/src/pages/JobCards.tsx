import { Box, Typography, Paper } from '@mui/material';
import { useAuth } from '../context/AuthContext';

export default function JobCards() {
  const { user } = useAuth();

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f5f5f5', p: 3 }}>
      <Typography variant="h4" fontWeight="bold" mb={2}>
        Job Cards
      </Typography>
      <Typography mb={4}>
        Welcome back, {user?.name}. This page will display your job cards.
      </Typography>
      <Paper sx={{ p: 3, borderRadius: 2 }}>
        <Typography color="text.secondary">Job card tracking will be available here.</Typography>
      </Paper>
    </Box>
  );
}
