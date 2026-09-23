import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase } from './supabase';
import type { AppRole, Profile } from './types';

interface AuthState {
  loading: boolean;
  email: string | null;
  profile: Profile | null;
}

const AuthContext = createContext<AuthState>({ loading: true, email: null, profile: null });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ loading: true, email: null, profile: null });

  useEffect(() => {
    let active = true;

    async function load() {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) {
        if (active) setState({ loading: false, email: null, profile: null });
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('id,church_id,full_name,role,active')
        .eq('id', user.id)
        .maybeSingle();
      if (active) setState({ loading: false, email: user.email ?? null, profile: (profile as Profile) ?? null });
    }

    load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => load());
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

/** Rôles considérés "encadrement financier" (visibilité globale des encaissements). */
export const FINANCE_ROLES: AppRole[] = ['super_admin', 'admin', 'treasurer'];

export function useHasRole(...roles: AppRole[]) {
  const { profile } = useAuth();
  return !!profile && roles.includes(profile.role);
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, email } = useAuth();
  const location = useLocation();
  if (loading) return <div className="loading-screen">Chargement…</div>;
  if (!email) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}

export function RequireRole({ roles, children }: { roles: AppRole[]; children: ReactNode }) {
  const { loading, profile } = useAuth();
  if (loading) return <div className="loading-screen">Chargement…</div>;
  if (!profile || !roles.includes(profile.role)) {
    return (
      <div className="panel">
        <h2>Accès restreint</h2>
        <p>Votre rôle ({profile?.role ?? 'inconnu'}) ne permet pas d'accéder à ce module.</p>
      </div>
    );
  }
  return <>{children}</>;
}
