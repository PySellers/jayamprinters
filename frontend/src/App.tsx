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

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
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
            <Route path="pricing-setup" element={<PricingSetup />} />
            <Route path="reports" element={<Reports />} />
            <Route path="taxes" element={<Taxes />} />
            <Route path="masters/:slug" element={<MasterTable />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
