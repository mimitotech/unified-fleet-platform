import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/providers/AuthProvider';
import { AppShell, AdminShell } from '@/components/app/AppShell';
import Landing from '@/pages/public/Landing';
import Login from '@/pages/auth/Login';
import Dashboard from '@/pages/app/Dashboard';
import Monitoring from '@/pages/app/Monitoring';
import AlertsPage from '@/pages/app/Alerts';
import Surveillance from '@/pages/app/Surveillance';
import Drivers from '@/pages/app/Drivers';
import RoutesPage from '@/pages/app/Routes';
import Fuel from '@/pages/app/Fuel';
import Emissions from '@/pages/app/Emissions';
import Workshop from '@/pages/app/Workshop';
import Reports from '@/pages/app/Reports';
import Geofencing from '@/pages/app/Geofencing';
import Commands from '@/pages/app/Commands';
import Trailers from '@/pages/app/Trailers';
import Sensors from '@/pages/app/Sensors';
import AdminTenants from '@/pages/admin/Tenants';
import TenantDetail from '@/pages/admin/TenantDetail';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/auth/login" element={<Login />} />

        <Route path="/app" element={<AppShell />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="monitoring" element={<Monitoring />} />
          <Route path="surveillance" element={<Surveillance />} />
          <Route path="drivers" element={<Drivers />} />
          <Route path="routes" element={<RoutesPage />} />
          <Route path="fuel" element={<Fuel />} />
          <Route path="emissions" element={<Emissions />} />
          <Route path="workshop" element={<Workshop />} />
          <Route path="reports" element={<Reports />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="geofencing" element={<Geofencing />} />
          <Route path="commands" element={<Commands />} />
          <Route path="trailers" element={<Trailers />} />
          <Route path="sensors" element={<Sensors />} />
        </Route>

        <Route path="/admin" element={<AdminShell />}>
          <Route index element={<AdminTenants />} />
          <Route path="tenants/:id" element={<TenantDetail />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
