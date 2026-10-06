import { Navigate } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import { useAuth } from '../context/AuthContext';
import type { UserRole } from '../types/common';

interface ProtectedRouteProps {
  children: JSX.Element;
  /** If omitted, any logged-in user may view this route. If set, only these
   * roles (plus admin, who can always see everything) may. */
  roles?: UserRole[];
}

export default function ProtectedRoute({ children, roles }: ProtectedRouteProps) {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (roles && roles.length > 0 && user.role !== 'admin' && !roles.includes(user.role)) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography variant="h5" sx={{ fontWeight: 'bold', mb: 1 }}>
          Not authorized
        </Typography>
        <Typography color="text.secondary">
          Your role ({user.role}) doesn't have access to this page. Ask an admin if you need it.
        </Typography>
      </Box>
    );
  }
  return children;
}
