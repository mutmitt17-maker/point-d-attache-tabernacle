import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { money } from '../lib/money';

interface VerifyResult {
  receipt_no: string;
  amount: number;
  currency: string;
  occurred_at: string;
  church_name: string;
  state: string;
}

export default function VerifyReceipt() {
  const { token } = useParams<{ token: string }>();
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    supabase
      .rpc('verify_receipt', { p_token: token })
      .then(({ data }) => {
        const row = Array.isArray(data) ? data[0] : data;
        setResult((row as VerifyResult) ?? null);
        setLoading(false);
      });
  }, [token]);

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="brand">
          Eglise<span>Collecte</span>
        </div>
        <p className="caption">Vérification publique de reçu</p>
        {loading && <p>Vérification en cours…</p>}
        {!loading && !result && (
          <div className="verify-fail">
            <XCircle size={40} />
            <p>Ce reçu est introuvable ou invalide.</p>
          </div>
        )}
        {!loading && result && (
          <div className="verify-ok">
            <CheckCircle2 size={40} />
            <p>
              Reçu <strong>{result.receipt_no}</strong> authentique — {result.church_name}
            </p>
            <p>
              Montant : <strong>{money(result.amount, result.currency)}</strong>
            </p>
            <p>Date : {new Date(result.occurred_at).toLocaleString('fr-CD')}</p>
            {result.state === 'voided' && <p className="form-error">Ce paiement a depuis été annulé.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
