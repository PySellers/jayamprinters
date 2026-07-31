import DashboardIcon from '@mui/icons-material/Dashboard';
import PeopleIcon from '@mui/icons-material/People';
import DescriptionIcon from '@mui/icons-material/Description';
import AssignmentIcon from '@mui/icons-material/Assignment';
import ReceiptIcon from '@mui/icons-material/Receipt';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import PriceChangeIcon from '@mui/icons-material/PriceChange';
import BarChartIcon from '@mui/icons-material/BarChart';
import TuneIcon from '@mui/icons-material/Tune';
import BadgeIcon from '@mui/icons-material/Badge';
import { mastersConfig } from '../../api/mastersApi';
import type { UserRole } from '../../types/users';

export interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType;
  /** Omit to show to every authenticated role. */
  roles?: UserRole[];
}

export const mainNavItems: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: DashboardIcon },
  { label: 'Customers', path: '/customers', icon: PeopleIcon },
  { label: 'Quotations', path: '/quotations', icon: DescriptionIcon },
  { label: 'Job Cards', path: '/job-cards', icon: AssignmentIcon },
  { label: 'Invoices', path: '/invoices', icon: ReceiptIcon },
  { label: 'Products', path: '/products', icon: Inventory2Icon },
  { label: 'Pricing Setup', path: '/pricing-setup', icon: PriceChangeIcon, roles: ['admin'] },
  { label: 'Reports', path: '/reports', icon: BarChartIcon, roles: ['admin', 'accounts'] },
  { label: 'Users', path: '/users', icon: BadgeIcon, roles: ['admin'] },
];

export const mastersNavItems: NavItem[] = [
  ...mastersConfig.map((c) => ({ label: c.label, path: `/masters/${c.slug}`, icon: TuneIcon, roles: ['admin'] as UserRole[] })),
  { label: 'Tax', path: '/taxes', icon: TuneIcon, roles: ['admin'] },
];
