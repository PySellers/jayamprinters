import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Customers from './pages/Customers';
import Quotations from './pages/Quotations';
import QuotationCreate from './pages/QuotationCreate';
import QuotationDetail from './pages/QuotationDetail';
import JobCards from './pages/JobCards';
import Invoices from './pages/Invoices';
import InvoiceDetail from './pages/InvoiceDetail';
import Products from './pages/Products';
import Taxes from './pages/Taxes';
import PricingSetup from './pages/PricingSetup';
import PriceMatrix from './pages/PriceMatrix';
import Reports from './pages/Reports';
import MasterTable from './components/masters/MasterTable';
import Users from './pages/Users';
import Purchases from './pages/Purchases';
import Inventory from './pages/Inventory';
import CashLedger from './pages/CashLedger';
import BillingCounter from './pages/BillingCounter';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/billing-counter"
            element={
              <ProtectedRoute>
                <BillingCounter />
              </ProtectedRoute>
            }
          />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="customers" element={<Customers />} />
            <Route path="quotations" element={<Quotations />} />
            <Route path="quotations/new" element={<QuotationCreate />} />
            <Route path="quotations/:id" element={<QuotationDetail />} />
            <Route path="job-cards" element={<JobCards />} />
            <Route path="invoices" element={<Invoices />} />
            <Route path="invoices/:id" element={<InvoiceDetail />} />
            <Route path="products" element={<Products />} />
            <Route path="products/:productId/price-matrix" element={<PriceMatrix />} />
            <Route
              path="pricing-setup"
              element={
                <ProtectedRoute roles={['admin']}>
                  <PricingSetup />
                </ProtectedRoute>
              }
            />
            <Route path="reports" element={<Reports />} />
            <Route
              path="taxes"
              element={
                <ProtectedRoute roles={['admin']}>
                  <Taxes />
                </ProtectedRoute>
              }
            />
            <Route
              path="masters/:slug"
              element={
                <ProtectedRoute roles={['admin']}>
                  <MasterTable />
                </ProtectedRoute>
              }
            />
            <Route
              path="users"
              element={
                <ProtectedRoute roles={['admin']}>
                  <Users />
                </ProtectedRoute>
              }
            />
            <Route
              path="purchases"
              element={
                <ProtectedRoute roles={['admin', 'accounts']}>
                  <Purchases />
                </ProtectedRoute>
              }
            />
            <Route path="inventory" element={<Inventory />} />
            <Route
              path="cash-ledger"
              element={
                <ProtectedRoute roles={['admin', 'accounts']}>
                  <CashLedger />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
