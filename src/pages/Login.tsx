import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'reset'>('signin');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: Location })?.from?.pathname ?? '/';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate(from, { replace: true });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) throw error;
        setInfo('Un lien de réinitialisation a été envoyé si ce compte existe.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <div className="brand">
          Eglise<span>Collecte</span>
        </div>
        <p className="caption">Gestion sécurisée des engagements financiers</p>
        <label>
          Adresse e-mail
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </label>
        {mode === 'signin' && (
          <label>
            Mot de passe
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </label>
        )}
        {error && <p className="form-error">{error}</p>}
        {info && <p className="form-info">{info}</p>}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'Veuillez patienter…' : mode === 'signin' ? 'Se connecter' : 'Envoyer le lien'}
        </button>
        <button type="button" className="link-btn" onClick={() => setMode(mode === 'signin' ? 'reset' : 'signin')}>
          {mode === 'signin' ? 'Mot de passe oublié ?' : 'Retour à la connexion'}
        </button>
      </form>
    </div>
  );
}
