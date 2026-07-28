import { Box, Typography, Paper } from '@mui/material';
import { useAuth } from '../context/AuthContext';

export default function Customers() {
  const { user } = useAuth();

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f5f5f5', p: 3 }}>
      <Typography variant="h4" fontWeight="bold" mb={2}>
        Customers
      </Typography>
      <Typography mb={4}>
        Welcome back, {user?.name}. This page will display your customer records.
      </Typography>
      <Paper sx={{ p: 3, borderRadius: 2 }}>
        <Typography color="text.secondary">Customer list will appear here once data is connected.</Typography>
      </Paper>
    </Box>
  );
}
