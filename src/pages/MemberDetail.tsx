import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { money } from '../lib/money';
import { StatusBadge } from '../components/StatusBadge';
import { METHOD_LABELS, type Member, type Pledge, type Payment } from '../lib/types';

export default function MemberDetail() {
  const { id } = useParams<{ id: string }>();
  const [member, setMember] = useState<Member | null>(null);
  const [pledges, setPledges] = useState<Pledge[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  useEffect(() => {
    if (!id) return;
    supabase
      .from('members')
      .select('id,member_no,full_name,phone,whatsapp,address,avenue,status,notes,neighborhoods(name),church_groups(name)')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => setMember(data as unknown as Member));
    supabase
      .from('pledges')
      .select('id,amount,currency,paid_amount,balance,status,due_on,campaigns(name)')
      .eq('member_id', id)
      .then(({ data }) => setPledges((data || []) as unknown as Pledge[]));
    supabase
      .from('payments')
      .select('id,amount,currency,method,receipt_no,state,occurred_at,pledges!inner(member_id,campaigns(name))')
      .eq('pledges.member_id', id)
      .order('occurred_at', { ascending: false })
      .then(({ data }) => setPayments((data || []) as unknown as Payment[]));
  }, [id]);

  if (!member) return <p>Chargement…</p>;

  return (
    <>
      <header>
        <div>
          <Link to="/members" className="back-link">
            <ArrowLeft size={15} /> Retour aux membres
          </Link>
          <h1>{member.full_name}</h1>
          <p>
            {member.member_no} · {member.phone || 'Sans téléphone'} · {member.neighborhoods?.name || 'Sans quartier'}
          </p>
        </div>
      </header>

      <section className="panel">
        <h2>Souscriptions</h2>
        <table>
          <thead>
            <tr>
              <th>Campagne</th>
              <th>Souscrit</th>
              <th>Payé</th>
              <th>Solde</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {pledges.map((p) => (
              <tr key={p.id}>
                <td>{p.campaigns?.name}</td>
                <td>{money(p.amount, p.currency)}</td>
                <td>{money(p.paid_amount, p.currency)}</td>
                <td>{money(p.balance, p.currency)}</td>
                <td>
                  <StatusBadge status={p.status} />
                </td>
              </tr>
            ))}
            {!pledges.length && (
              <tr>
                <td colSpan={5}>Aucune souscription enregistrée.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>Historique des encaissements</h2>
        <table>
          <thead>
            <tr>
              <th>Reçu</th>
              <th>Campagne</th>
              <th>Montant</th>
              <th>Moyen</th>
              <th>Statut</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{p.receipt_no}</td>
                <td>{p.pledges?.campaigns?.name}</td>
                <td>{money(p.amount, p.currency)}</td>
                <td>{METHOD_LABELS[p.method]}</td>
                <td>{p.state}</td>
                <td>{new Date(p.occurred_at).toLocaleDateString('fr-CD')}</td>
              </tr>
            ))}
            {!payments.length && (
              <tr>
                <td colSpan={6}>Aucun paiement enregistré.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
