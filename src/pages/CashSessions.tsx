import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { money } from '../lib/money';
import { useAuth, useHasRole } from '../lib/auth';
import type { CashSession } from '../lib/types';

export default function CashSessions() {
  const { profile } = useAuth();
  const [current, setCurrent] = useState<CashSession | null>(null);
  const [theoretical, setTheoretical] = useState(0);
  const [declared, setDeclared] = useState('');
  const [varianceNote, setVarianceNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const isFinance = useHasRole('super_admin', 'admin', 'treasurer');

  async function load() {
    const { data } = await supabase
      .from('cash_sessions')
      .select('id,collector_id,opened_at,closed_at,state,declared_cash,variance_note')
      .eq('collector_id', profile?.id)
      .eq('state', 'open')
      .maybeSingle();
    setCurrent((data as CashSession) ?? null);
    if (data) {
      const { data: payRows } = await supabase.from('payments').select('amount').eq('cash_session_id', data.id).eq('state', 'validated').eq('method', 'cash');
      setTheoretical((payRows || []).reduce((s, r) => s + Number(r.amount), 0));
    }
  }

  useEffect(() => {
    if (profile) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  async function open() {
    setBusy(true);
    const { error } = await supabase.rpc('open_cash_session');
    if (error) setMessage(error.message);
    await load();
    setBusy(false);
  }

  async function close() {
    if (!current) return;
    setBusy(true);
    const { error } = await supabase.rpc('close_cash_session', {
      p_session: current.id,
      p_declared: Number(declared || 0),
      p_variance_note: varianceNote || null,
    });
    if (error) setMessage(error.message);
    else setMessage('Caisse clôturée. Vous pouvez maintenant remettre le montant au trésorier.');
    setDeclared('');
    setVarianceNote('');
    await load();
    setBusy(false);
  }

  return (
    <>
      <header>
        <div>
          <h1>Caisse et clôtures</h1>
          <p>Ouvrez une session avant tout encaissement en espèces, clôturez-la en fin de journée.</p>
        </div>
      </header>

      {message && <p className="form-info">{message}</p>}

      <section className="panel">
        {!current && (
          <>
            <p>Aucune session de caisse ouverte.</p>
            <button className="primary" onClick={open} disabled={busy}>
              Ouvrir ma caisse
            </button>
          </>
        )}
        {current && (
          <>
            <p>
              Session ouverte le {new Date(current.opened_at).toLocaleString('fr-CD')} — montant théorique en espèces :{' '}
              <strong>{money(theoretical)}</strong>
            </p>
            <div className="form-grid">
              <label>
                Montant espèces déclaré physiquement
                <input type="number" min={0} value={declared} onChange={(e) => setDeclared(e.target.value)} />
              </label>
              <label className="span-2">
                Justification de l'écart (obligatoire si différent du montant théorique)
                <input value={varianceNote} onChange={(e) => setVarianceNote(e.target.value)} />
              </label>
            </div>
            <button className="primary" onClick={close} disabled={busy || !declared}>
              Clôturer la caisse
            </button>
          </>
        )}
      </section>

      <HandoverPanel />
      {isFinance && <HandoverValidation />}
    </>
  );
}

function HandoverPanel() {
  const [closedSessions, setClosedSessions] = useState<{ id: string; declared_cash: number | null; closed_at: string | null }[]>([]);
  const [amount, setAmount] = useState('');
  const [sessionId, setSessionId] = useState('');

  async function load() {
    const { data } = await supabase.from('cash_sessions').select('id,declared_cash,closed_at').eq('state', 'closed').order('closed_at', { ascending: false }).limit(10);
    setClosedSessions((data || []) as typeof closedSessions);
  }

  useEffect(() => {
    load();
  }, []);

  async function submit() {
    if (!sessionId || !amount) return;
    await supabase.rpc('record_cash_handover', { p_session: sessionId, p_amount: Number(amount) });
    setAmount('');
    setSessionId('');
    load();
  }

  return (
    <section className="panel">
      <h2>Remise au trésorier</h2>
      <div className="form-grid">
        <label>
          Session de caisse clôturée
          <select value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
            <option value="">—</option>
            {closedSessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.closed_at ? new Date(s.closed_at).toLocaleDateString('fr-CD') : s.id} — {money(s.declared_cash || 0)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Montant remis
          <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
      </div>
      <button className="primary" onClick={submit} disabled={!sessionId || !amount}>
        Soumettre la remise
      </button>
    </section>
  );
}

function HandoverValidation() {
  const [rows, setRows] = useState<{ id: string; amount: number; slip_no: string | null; submitted_at: string; profiles?: { full_name: string } | null }[]>([]);

  async function load() {
    const { data } = await supabase
      .from('cash_handover')
      .select('id,amount,slip_no,submitted_at,state')
      .eq('state', 'submitted')
      .order('submitted_at', { ascending: false });
    setRows((data || []) as unknown as typeof rows);
  }

  useEffect(() => {
    load();
  }, []);

  async function validate(id: string, approve: boolean) {
    const reason = approve ? undefined : prompt('Motif du rejet :') || undefined;
    await supabase.rpc('validate_cash_handover', { p_handover: id, p_approve: approve, p_rejection_reason: reason });
    load();
  }

  return (
    <section className="panel">
      <h2>Remises en attente de validation</h2>
      <table>
        <thead>
          <tr>
            <th>Bordereau</th>
            <th>Montant</th>
            <th>Soumis le</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.slip_no}</td>
              <td>{money(r.amount)}</td>
              <td>{new Date(r.submitted_at).toLocaleString('fr-CD')}</td>
              <td className="row-actions">
                <button onClick={() => validate(r.id, true)}>Valider</button>
                <button onClick={() => validate(r.id, false)}>Rejeter</button>
              </td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={4}>Aucune remise en attente.</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
