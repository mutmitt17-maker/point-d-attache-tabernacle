import { useEffect, useState, type ReactNode } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  HandCoins,
  ReceiptText,
  LogOut,
  WalletCards,
  Target,
  MapPinned,
  Search,
  FileBarChart2,
  UserCog,
  ShieldCheck,
  Settings as SettingsIcon,
  Building2,
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { AuthProvider, useAuth, RequireAuth, RequireRole } from './lib/auth';
import type { AppRole } from './lib/types';

import Login from './pages/Login';
import VerifyReceipt from './pages/VerifyReceipt';
import Dashboard from './pages/Dashboard';
import Members from './pages/Members';
import MemberDetail from './pages/MemberDetail';
import Neighborhoods from './pages/Neighborhoods';
import Campaigns from './pages/Campaigns';
import Payments from './pages/Payments';
import Receipts from './pages/Receipts';
import Recovery from './pages/Recovery';
import CashSessions from './pages/CashSessions';
import Reports from './pages/Reports';
import UsersPage from './pages/Users';
import Audit from './pages/Audit';
import SettingsPage from './pages/Settings';

const NAV: { to: string; label: string; icon: typeof LayoutDashboard; roles?: AppRole[] }[] = [
  { to: '/', label: 'Tableau de bord', icon: LayoutDashboard },
  { to: '/members', label: 'Membres', icon: Users },
  { to: '/campaigns', label: 'Souscriptions', icon: Target },
  { to: '/payments', label: 'Encaissements', icon: HandCoins, roles: ['super_admin', 'admin', 'treasurer', 'collector'] },
  { to: '/recovery', label: 'Recouvrement', icon: Search },
  { to: '/neighborhoods', label: 'Quartiers', icon: MapPinned, roles: ['super_admin', 'admin', 'treasurer'] },
  { to: '/receipts', label: 'Reçus', icon: ReceiptText },
  { to: '/reports', label: 'Rapports', icon: FileBarChart2, roles: ['super_admin', 'admin', 'treasurer', 'auditor'] },
  { to: '/cash', label: 'Caisse et clôtures', icon: WalletCards, roles: ['super_admin', 'admin', 'treasurer', 'collector'] },
  { to: '/users', label: 'Utilisateurs', icon: UserCog, roles: ['super_admin'] },
  { to: '/audit', label: 'Audit', icon: ShieldCheck, roles: ['super_admin', 'admin', 'treasurer', 'auditor'] },
  { to: '/settings', label: 'Paramètres', icon: SettingsIcon, roles: ['super_admin', 'admin'] },
];

function Shell({ children }: { children: ReactNode }) {
  const { profile, email } = useAuth();
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <Building2 size={20} />
          Eglise<span>Collecte</span>
        </div>
        <p className="caption">Gestion sécurisée des engagements</p>
        <nav>
          {NAV.filter((item) => !item.roles || (profile && item.roles.includes(profile.role))).map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'}>
              <Icon size={19} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="user">
          <div>{profile?.full_name || email || 'Session'}</div>
          <div className="caption">{profile?.role}</div>
          <button onClick={() => supabase.auth.signOut()}>
            <LogOut size={16} /> Déconnexion
          </button>
        </div>
      </aside>
      <main>{children}</main>
    </div>
  );
}

function AuthedApp() {
  return (
    <RequireAuth>
      <Shell>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/members" element={<Members />} />
          <Route path="/members/:id" element={<MemberDetail />} />
          <Route path="/campaigns" element={<Campaigns />} />
          <Route
            path="/payments"
            element={
              <RequireRole roles={['super_admin', 'admin', 'treasurer', 'collector']}>
                <Payments />
              </RequireRole>
            }
          />
          <Route path="/recovery" element={<Recovery />} />
          <Route
            path="/neighborhoods"
            element={
              <RequireRole roles={['super_admin', 'admin', 'treasurer']}>
                <Neighborhoods />
              </RequireRole>
            }
          />
          <Route path="/receipts" element={<Receipts />} />
          <Route
            path="/reports"
            element={
              <RequireRole roles={['super_admin', 'admin', 'treasurer', 'auditor']}>
                <Reports />
              </RequireRole>
            }
          />
          <Route
            path="/cash"
            element={
              <RequireRole roles={['super_admin', 'admin', 'treasurer', 'collector']}>
                <CashSessions />
              </RequireRole>
            }
          />
          <Route
            path="/users"
            element={
              <RequireRole roles={['super_admin']}>
                <UsersPage />
              </RequireRole>
            }
          />
          <Route
            path="/audit"
            element={
              <RequireRole roles={['super_admin', 'admin', 'treasurer', 'auditor']}>
                <Audit />
              </RequireRole>
            }
          />
          <Route
            path="/settings"
            element={
              <RequireRole roles={['super_admin', 'admin']}>
                <SettingsPage />
              </RequireRole>
            }
          />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Shell>
    </RequireAuth>
  );
}

/** Synchronise automatiquement la file hors-ligne dès que la connexion revient. */
function useAutoSync() {
  useEffect(() => {
    const handler = () => import('./lib/offlineQueue').then((m) => m.syncQueuedPayments());
    window.addEventListener('online', handler);
    return () => window.removeEventListener('online', handler);
  }, []);
}

function App() {
  useAutoSync();
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/verify/:token" element={<VerifyReceipt />} />
        <Route path="/*" element={<AuthedApp />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
