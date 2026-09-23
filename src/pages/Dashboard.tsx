import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { money } from '../lib/money';
import { StatusBadge } from '../components/StatusBadge';
import type { Pledge } from '../lib/types';

interface Kpis {
  totalPledged: number;
  totalPaid: number;
  fullyPaid: number;
  partial: number;
  notStarted: number;
  todayPaid: number;
  monthPaid: number;
}

export default function Dashboard() {
  const [pledges, setPledges] = useState<Pledge[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [recentPayments, setRecentPayments] = useState<{ id: string; amount: number; currency: string; occurred_at: string; pledges: { members?: { full_name: string } | null; campaigns?: { name: string } | null } | null }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: pledgeRows } = await supabase
        .from('pledges')
        .select('id,amount,paid_amount,balance,currency,status,members(full_name,phone),campaigns(name)')
        .neq('status', 'annule')
        .order('balance', { ascending: false })
        .limit(8);
      setPledges((pledgeRows || []) as unknown as Pledge[]);

      const { data: allPledges } = await supabase.from('pledges').select('amount,paid_amount,status').neq('status', 'annule');
      const rows = allPledges || [];
      const totalPledged = rows.reduce((s, r) => s + Number(r.amount), 0);
      const totalPaid = rows.reduce((s, r) => s + Number(r.paid_amount), 0);

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const startOfMonth = new Date(startOfDay.getFullYear(), startOfDay.getMonth(), 1);
      const { data: todayRows } = await supabase.from('payments').select('amount').eq('state', 'validated').gte('occurred_at', startOfDay.toISOString());
      const { data: monthRows } = await supabase.from('payments').select('amount').eq('state', 'validated').gte('occurred_at', startOfMonth.toISOString());

      setKpis({
        totalPledged,
        totalPaid,
        fullyPaid: rows.filter((r) => r.status === 'solde').length,
        partial: rows.filter((r) => ['paiement_faible', 'a_moitie', 'paiement_avance'].includes(r.status)).length,
        notStarted: rows.filter((r) => r.status === 'non_commence').length,
        todayPaid: (todayRows || []).reduce((s, r) => s + Number(r.amount), 0),
        monthPaid: (monthRows || []).reduce((s, r) => s + Number(r.amount), 0),
      });

      const { data: payRows } = await supabase
        .from('payments')
        .select('id,amount,currency,occurred_at,pledges(members(full_name),campaigns(name))')
        .eq('state', 'validated')
        .order('occurred_at', { ascending: false })
        .limit(6);
      setRecentPayments((payRows || []) as unknown as typeof recentPayments);
      setLoading(false);
    })();
  }, []);

  const rate = kpis && kpis.totalPledged > 0 ? Math.round((kpis.totalPaid / kpis.totalPledged) * 100) : 0;

  return (
    <>
      <header>
        <div>
          <h1>Tableau de bord</h1>
          <p>Vue synthétique des souscriptions et encaissements.</p>
        </div>
      </header>

      <section className="cards">
        <Card title="Total souscrit" value={money(kpis?.totalPledged ?? 0)} />
        <Card title="Total encaissé" value={money(kpis?.totalPaid ?? 0)} />
        <Card title="Solde global restant" value={money((kpis?.totalPledged ?? 0) - (kpis?.totalPaid ?? 0))} />
        <Card title="Taux de recouvrement" value={`${rate} %`} />
      </section>
      <section className="cards">
        <Card title="Membres soldés" value={String(kpis?.fullyPaid ?? 0)} />
        <Card title="Paiement partiel" value={String(kpis?.partial ?? 0)} />
        <Card title="Rien payé" value={String(kpis?.notStarted ?? 0)} />
        <Card title="Encaissé aujourd'hui" value={money(kpis?.todayPaid ?? 0)} />
        <Card title="Encaissé ce mois-ci" value={money(kpis?.monthPaid ?? 0)} />
      </section>

      <div className="two-col">
        <section className="panel">
          <h2>Soldes les plus élevés à recouvrer</h2>
          <table>
            <thead>
              <tr>
                <th>Membre</th>
                <th>Campagne</th>
                <th>Solde</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {pledges.map((p) => (
                <tr key={p.id}>
                  <td>{p.members?.full_name}</td>
                  <td>{p.campaigns?.name}</td>
                  <td>{money(p.balance, p.currency)}</td>
                  <td>
                    <StatusBadge status={p.status} />
                  </td>
                </tr>
              ))}
              {!loading && !pledges.length && (
                <tr>
                  <td colSpan={4}>Aucune donnée pour le moment.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="panel">
          <h2>Derniers encaissements</h2>
          <table>
            <thead>
              <tr>
                <th>Membre</th>
                <th>Campagne</th>
                <th>Montant</th>
                <th>Quand</th>
              </tr>
            </thead>
            <tbody>
              {recentPayments.map((p) => (
                <tr key={p.id}>
                  <td>{p.pledges?.members?.full_name ?? '—'}</td>
                  <td>{p.pledges?.campaigns?.name ?? '—'}</td>
                  <td>{money(p.amount, p.currency)}</td>
                  <td>{new Date(p.occurred_at).toLocaleString('fr-CD')}</td>
                </tr>
              ))}
              {!loading && !recentPayments.length && (
                <tr>
                  <td colSpan={4}>Aucun encaissement validé pour le moment.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="card">
      <p>{title}</p>
      <strong>{value}</strong>
    </div>
  );
}
