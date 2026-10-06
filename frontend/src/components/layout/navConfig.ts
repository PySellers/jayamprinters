import DashboardIcon from '@mui/icons-material/Dashboard';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import PeopleIcon from '@mui/icons-material/People';
import DescriptionIcon from '@mui/icons-material/Description';
import AssignmentIcon from '@mui/icons-material/Assignment';
import ReceiptIcon from '@mui/icons-material/Receipt';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import WarehouseIcon from '@mui/icons-material/Warehouse';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import PriceChangeIcon from '@mui/icons-material/PriceChange';
import BarChartIcon from '@mui/icons-material/BarChart';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import TuneIcon from '@mui/icons-material/Tune';
import { mastersConfig } from '../../api/mastersApi';
import type { UserRole } from '../../types/common';

export interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType;
  /** Omit for "any logged-in role". Admin can always see everything regardless. */
  roles?: UserRole[];
}

export const mainNavItems: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: DashboardIcon },
  { label: 'Billing Counter', path: '/billing-counter', icon: PointOfSaleIcon },
  { label: 'Customers', path: '/customers', icon: PeopleIcon },
  { label: 'Quotations', path: '/quotations', icon: DescriptionIcon },
  { label: 'Job Cards', path: '/job-cards', icon: AssignmentIcon },
  { label: 'Invoices', path: '/invoices', icon: ReceiptIcon },
  { label: 'Products', path: '/products', icon: Inventory2Icon },
  { label: 'Pricing Setup', path: '/pricing-setup', icon: PriceChangeIcon, roles: ['admin'] },
  { label: 'Purchases', path: '/purchases', icon: ShoppingCartIcon, roles: ['admin', 'accounts'] },
  { label: 'Inventory', path: '/inventory', icon: WarehouseIcon },
  { label: 'Cash Ledger', path: '/cash-ledger', icon: AccountBalanceIcon, roles: ['admin', 'accounts'] },
  { label: 'Reports', path: '/reports', icon: BarChartIcon },
  { label: 'Users', path: '/users', icon: ManageAccountsIcon, roles: ['admin'] },
];

// Masters (printing types, machines, tax) are read-only for non-admins on the
// backend, and editing them is the whole point of this section, so it's
// hidden from the nav entirely for non-admin roles rather than shown as a
// read-only dead end.
export const mastersNavItems: NavItem[] = [
  ...mastersConfig.map((c) => ({ label: c.label, path: `/masters/${c.slug}`, icon: TuneIcon, roles: ['admin'] as UserRole[] })),
  { label: 'Tax', path: '/taxes', icon: TuneIcon, roles: ['admin'] },
];
