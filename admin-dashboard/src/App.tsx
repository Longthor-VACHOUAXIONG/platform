import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import RidesPage from './pages/RidesPage';
import DriversPage from './pages/DriversPage';
import PricingPage from './pages/PricingPage';
import AnalyticsPage from './pages/AnalyticsPage';
import WalletSettingsPage from './pages/WalletSettingsPage';
import TopUpRequestsPage from './pages/TopUpRequestsPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/rides" replace />} />
            <Route path="rides" element={<RidesPage />} />
            <Route path="drivers" element={<DriversPage />} />
            <Route path="pricing" element={<PricingPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="wallet-settings" element={<WalletSettingsPage />} />
            <Route path="topups" element={<TopUpRequestsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
