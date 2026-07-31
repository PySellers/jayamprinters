import { TableRow, TableCell, Box, Typography } from '@mui/material';
import InboxIcon from '@mui/icons-material/Inbox';

interface EmptyStateProps {
  colSpan: number;
  message: string;
}

export default function EmptyState({ colSpan, message }: EmptyStateProps) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} align="center" sx={{ py: 6, border: 0 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
          <InboxIcon sx={{ fontSize: 40, opacity: 0.4 }} />
          <Typography variant="body2" color="text.secondary">
            {message}
          </Typography>
        </Box>
      </TableCell>
    </TableRow>
  );
}
