import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AuthProvider } from '@/providers/AuthProvider';
import { AppShell, AdminShell } from '@/components/app/AppShell';
import Landing from '@/pages/public/Landing';
import Login from '@/pages/auth/Login';
import TermsOfUse from '@/pages/auth/TermsOfUse';
import { PublicTermsOfUse, PublicPrivacyPolicy } from '@/pages/public/LegalDocuments';
import Dashboard from '@/pages/app/Dashboard';
import Monitoring from '@/pages/app/Monitoring';
import AlertsPage from '@/pages/app/Alerts';
import Surveillance from '@/pages/app/Surveillance';
import Drivers from '@/pages/app/Drivers';
import RoutesPage from '@/pages/app/Routes';
import Fuel from '@/pages/app/Fuel';
import Emissions from '@/pages/app/Emissions';
import Workshop from '@/pages/app/Workshop';
import Geofencing from '@/pages/app/Geofencing';
import Commands from '@/pages/app/Commands';
import Trailers from '@/pages/app/Trailers';
import Sensors from '@/pages/app/Sensors';
import Settings from '@/pages/app/Settings';
import { ClientModulePage } from '@/components/app/ClientModulePage';
import AdminDashboard from '@/pages/admin/Dashboard';
import AdminTenantsPage from '@/pages/admin/TenantsPage';
import AdminUsersPage from '@/pages/admin/UsersPage';
import AdminSystemPage from '@/pages/admin/SystemPage';
import AdminMarketplacePage from '@/pages/admin/MarketplacePage';
import AdminSupportPage from '@/pages/admin/SupportPage';
import TenantCreate from '@/pages/admin/TenantCreate';
import TenantDetail from '@/pages/admin/TenantDetail';
import SystemUsersPage from '@/pages/admin/SystemUsersPage';
import AdminAccountPage from '@/pages/admin/AccountPage';
import WialonCenter from '@/pages/admin/WialonCenter';
import LocoNavCenter from '@/pages/admin/LocoNavCenter';
import TrackSolidCenter from '@/pages/admin/TrackSolidCenter';

/** Remount detail when switching clients so form/integration state never sticks. */
function TenantDetailRoute() {
  const { id } = useParams<{ id: string }>();
  return <TenantDetail key={id} />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/auth/login" element={<Login />} />
        <Route path="/auth/terms" element={<TermsOfUse />} />
        <Route path="/terms-of-use" element={<PublicTermsOfUse />} />
        <Route path="/privacy-policy" element={<PublicPrivacyPolicy />} />
        <Route path="/terms" element={<PublicTermsOfUse />} />
        <Route path="/privacy" element={<PublicPrivacyPolicy />} />

        <Route path="/app" element={<AppShell />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<ClientModulePage moduleKey="dashboard"><Dashboard /></ClientModulePage>} />
          <Route path="monitoring" element={<ClientModulePage moduleKey="monitoring"><Monitoring /></ClientModulePage>} />
          <Route path="surveillance" element={<ClientModulePage moduleKey="surveillance"><Surveillance /></ClientModulePage>} />
          <Route path="drivers" element={<ClientModulePage moduleKey="drivers"><Drivers /></ClientModulePage>} />
          <Route path="routes" element={<ClientModulePage moduleKey="routes"><RoutesPage /></ClientModulePage>} />
          <Route path="fuel" element={<ClientModulePage moduleKey="fuel"><Fuel /></ClientModulePage>} />
          <Route path="emissions" element={<ClientModulePage moduleKey="emissions"><Emissions /></ClientModulePage>} />
          <Route path="workshop" element={<ClientModulePage moduleKey="workshop"><Workshop /></ClientModulePage>} />
          <Route path="reports" element={<Navigate to="/app/dashboard" replace />} />
          <Route path="alerts" element={<ClientModulePage moduleKey="alerts"><AlertsPage /></ClientModulePage>} />
          <Route path="geofencing" element={<ClientModulePage moduleKey="geofencing"><Geofencing /></ClientModulePage>} />
          <Route path="commands" element={<ClientModulePage moduleKey="commands"><Commands /></ClientModulePage>} />
          <Route path="trailers" element={<ClientModulePage moduleKey="trailers"><Trailers /></ClientModulePage>} />
          <Route path="sensors" element={<ClientModulePage moduleKey="sensors"><Sensors /></ClientModulePage>} />
          <Route path="settings" element={<Settings />} />
        </Route>

        <Route path="/admin" element={<AdminShell />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="tenants" element={<AdminTenantsPage />} />
          <Route path="tenants/new" element={<TenantCreate />} />
          <Route path="tenants/:id" element={<TenantDetailRoute />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="system-users" element={<SystemUsersPage />} />
          <Route path="system" element={<AdminSystemPage />} />
          <Route path="marketplace" element={<AdminMarketplacePage />} />
          <Route path="wialon" element={<WialonCenter />} />
          <Route path="loconav" element={<LocoNavCenter />} />
          <Route path="tracksolid" element={<TrackSolidCenter />} />
          <Route path="support" element={<AdminSupportPage />} />
          <Route path="account" element={<AdminAccountPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
