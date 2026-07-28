import { Box, Typography, Paper } from '@mui/material';
import { useAuth } from '../context/AuthContext';

export default function Quotations() {
  const { user } = useAuth();

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f5f5f5', p: 3 }}>
      <Typography variant="h4" fontWeight="bold" mb={2}>
        Quotations
      </Typography>
      <Typography mb={4}>
        Welcome back, {user?.name}. This page will display your quotations.
      </Typography>
      <Paper sx={{ p: 3, borderRadius: 2 }}>
        <Typography color="text.secondary">Quotation management will be added here.</Typography>
      </Paper>
    </Box>
  );
}
