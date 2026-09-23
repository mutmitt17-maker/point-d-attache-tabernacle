import { useEffect, useState } from 'react';
import { Search, Printer, Ban } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { money } from '../lib/money';
import { downloadReceipt } from '../lib/receipt';
import { useAuth, useHasRole } from '../lib/auth';
import { METHOD_LABELS, type Payment } from '../lib/types';

export default function Receipts() {
  const { profile } = useAuth();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Payment[]>([]);
  const canValidateVoid = useHasRole('super_admin', 'admin', 'treasurer');

  async function search() {
    let query = supabase
      .from('payments')
      .select('id,amount,currency,method,receipt_no,state,occurred_at,verification_token,pledges(members(full_name),campaigns(name),paid_amount,balance)')
      .order('occurred_at', { ascending: false })
      .limit(50);
    if (q) query = query.ilike('receipt_no', `%${q}%`);
    const { data } = await query;
    setRows((data || []) as unknown as Payment[]);
  }

  useEffect(() => {
    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function reprint(p: Payment) {
    await downloadReceipt({
      receiptNo: p.receipt_no,
      churchName: 'Eglise',
      memberName: p.pledges?.members?.full_name ?? '',
      campaignName: p.pledges?.campaigns?.name ?? '',
      amount: p.amount,
      currency: p.currency,
      totalPaid: (p.pledges as unknown as { paid_amount: number })?.paid_amount ?? p.amount,
      balance: (p.pledges as unknown as { balance: number })?.balance ?? 0,
      method: METHOD_LABELS[p.method],
      occurredAt: p.occurred_at,
      collectorName: profile?.full_name ?? '',
      verificationToken: p.verification_token,
    });
    await supabase.from('audit_logs').insert({ action: 'REPRINT_RECEIPT', entity: 'payments', entity_id: p.id, metadata: { receipt_no: p.receipt_no } }).select().maybeSingle();
  }

  async function requestVoid(p: Payment) {
    const reason = prompt('Motif de la demande d\'annulation (obligatoire) :');
    if (!reason) return;
    const { error } = await supabase.rpc('request_void_payment', { p_payment: p.id, p_reason: reason });
    if (!error) search();
  }

  async function approveVoid(p: Payment, approve: boolean) {
    const { error } = await supabase.rpc('approve_void_payment', { p_payment: p.id, p_approve: approve });
    if (!error) search();
  }

  return (
    <>
      <header>
        <div>
          <h1>Reçus</h1>
          <p>Recherchez un reçu, réimprimez-le ou demandez une correction encadrée.</p>
        </div>
      </header>

      <div className="toolbar">
        <Search size={18} />
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="Numéro de reçu" />
        <button onClick={search}>Rechercher</button>
      </div>

      <section className="panel">
        <table>
          <thead>
            <tr>
              <th>Reçu</th>
              <th>Membre</th>
              <th>Campagne</th>
              <th>Montant</th>
              <th>Moyen</th>
              <th>Statut</th>
              <th>Date</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.receipt_no}</td>
                <td>{p.pledges?.members?.full_name ?? '—'}</td>
                <td>{p.pledges?.campaigns?.name ?? '—'}</td>
                <td>{money(p.amount, p.currency)}</td>
                <td>{METHOD_LABELS[p.method]}</td>
                <td>{p.state}</td>
                <td>{new Date(p.occurred_at).toLocaleDateString('fr-CD')}</td>
                <td className="row-actions">
                  <button onClick={() => reprint(p)}>
                    <Printer size={14} /> Réimprimer
                  </button>
                  {p.state === 'validated' && (
                    <button onClick={() => requestVoid(p)}>
                      <Ban size={14} /> Annulation
                    </button>
                  )}
                  {p.state === 'void_requested' && canValidateVoid && (
                    <>
                      <button onClick={() => approveVoid(p, true)}>Valider l'annulation</button>
                      <button onClick={() => approveVoid(p, false)}>Rejeter</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={8}>Aucun reçu trouvé.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
