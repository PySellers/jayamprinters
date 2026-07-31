import { Box, Typography } from '@mui/material';

interface BarChartProps {
  data: { label: string; value: number }[];
  color?: string;
}

export default function BarChart({ data, color = '#1a237e' }: BarChartProps) {
  if (data.length === 0) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography color="text.secondary" variant="body2">No data in this range.</Typography>
      </Box>
    );
  }

  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1.5, height: 220, overflowX: 'auto', px: 1, pt: 2 }}>
      {data.map((d) => (
        <Box key={d.label} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 56, flexShrink: 0 }}>
          <Typography variant="caption" sx={{ mb: 0.5, whiteSpace: 'nowrap' }}>
            ₹{d.value.toFixed(0)}
          </Typography>
          <Box
            sx={{
              width: 32,
              height: Math.max((d.value / max) * 150, 2),
              bgcolor: color,
              borderRadius: '4px 4px 0 0',
              transition: 'height 0.3s',
            }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, whiteSpace: 'nowrap' }}>
            {d.label}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
