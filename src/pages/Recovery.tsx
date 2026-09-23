import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { money } from '../lib/money';
import { StatusBadge } from '../components/StatusBadge';
import { useHasRole } from '../lib/auth';
import type { Campaign, Neighborhood, Pledge, PledgeStatus, VisitStatus } from '../lib/types';

const VISIT_LABELS: Record<VisitStatus, string> = {
  a_faire: 'À faire',
  visite: 'Visité',
  absent: 'Absent',
  promesse: 'Promesse de paiement',
  paye_partiel: 'Payé partiellement',
  refus: 'Refus',
  a_reprogrammer: 'À reprogrammer',
};

interface Row extends Pledge {
  members?: { id: string; full_name: string; phone: string | null; neighborhood_id: string | null } | null;
}

export default function Recovery() {
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [neighborhood, setNeighborhood] = useState('');
  const [campaign, setCampaign] = useState('');
  const [status, setStatus] = useState<PledgeStatus | ''>('');
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const canPlan = useHasRole('super_admin', 'admin', 'treasurer', 'neighborhood_manager');

  useEffect(() => {
    supabase.from('neighborhoods').select('id,name,commune').order('name').then(({ data }) => setNeighborhoods((data || []) as Neighborhood[]));
    supabase.from('campaigns').select('*').eq('state', 'active').then(({ data }) => setCampaigns((data || []) as Campaign[]));
  }, []);

  async function search() {
    let query = supabase
      .from('pledges')
      .select('id,amount,currency,paid_amount,balance,status,due_on,campaign_id,member_id,members!inner(id,full_name,phone,neighborhood_id),campaigns(name)')
      .neq('status', 'annule')
      .order('balance', { ascending: false })
      .limit(200);
    if (neighborhood) query = query.eq('members.neighborhood_id', neighborhood);
    if (campaign) query = query.eq('campaign_id', campaign);
    if (status) query = query.eq('status', status);
    const { data } = await query;
    setRows((data || []) as unknown as Row[]);
    setSelected(new Set());
  }

  useEffect(() => {
    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function createMission() {
    const collectorId = prompt('Identifiant (UUID) du percepteur à affecter :');
    if (!collectorId) return;
    const plannedOn = prompt('Date prévue (AAAA-MM-JJ) :') || null;
    const rowsToVisit = rows.filter((r) => selected.has(r.id) && r.members);
    const inserts = rowsToVisit.map((r) => ({
      member_id: r.members!.id,
      campaign_id: r.campaign_id,
      collector_id: collectorId,
      planned_on: plannedOn,
      status: 'a_faire' as VisitStatus,
    }));
    if (!inserts.length) return;
    await supabase.from('collection_visits').insert(inserts);
    alert(`${inserts.length} visite(s) planifiée(s).`);
    setSelected(new Set());
  }

  return (
    <>
      <header>
        <div>
          <h1>Recouvrement par quartier</h1>
          <p>Filtrez les impayés et organisez des missions de visite ciblées.</p>
        </div>
      </header>

      <div className="filters">
        <select value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)}>
          <option value="">Tous les quartiers</option>
          {neighborhoods.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
        <select value={campaign} onChange={(e) => setCampaign(e.target.value)}>
          <option value="">Toutes les campagnes actives</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as PledgeStatus | '')}>
          <option value="">Tous les statuts</option>
          <option value="non_commence">Rien payé</option>
          <option value="paiement_faible">Paiement faible</option>
          <option value="a_moitie">À moitié</option>
          <option value="paiement_avance">Paiement avancé</option>
          <option value="en_retard">En retard</option>
        </select>
        <button className="primary" onClick={search}>
          Filtrer
        </button>
      </div>

      <section className="panel">
        {canPlan && (
          <div className="modal-actions" style={{ marginBottom: 12 }}>
            <button onClick={createMission} disabled={!selected.size}>
              Créer une mission de visite ({selected.size})
            </button>
          </div>
        )}
        <table>
          <thead>
            <tr>
              {canPlan && <th />}
              <th>Membre</th>
              <th>Téléphone</th>
              <th>Campagne</th>
              <th>Solde</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                {canPlan && (
                  <td>
                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                  </td>
                )}
                <td>{r.members?.full_name}</td>
                <td>{r.members?.phone || '—'}</td>
                <td>{r.campaigns?.name}</td>
                <td>{money(r.balance, r.currency)}</td>
                <td>
                  <StatusBadge status={r.status} />
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6}>Aucun résultat pour ces filtres.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <VisitsPanel labels={VISIT_LABELS} />
    </>
  );
}

function VisitsPanel({ labels }: { labels: Record<VisitStatus, string> }) {
  const [visits, setVisits] = useState<{ id: string; status: VisitStatus; planned_on: string | null; notes: string | null; members?: { full_name: string } | null }[]>([]);

  async function load() {
    const { data } = await supabase
      .from('collection_visits')
      .select('id,status,planned_on,notes,members(full_name)')
      .order('planned_on', { ascending: true })
      .limit(50);
    setVisits((data || []) as unknown as typeof visits);
  }

  useEffect(() => {
    load();
  }, []);

  async function updateStatus(id: string, status: VisitStatus) {
    await supabase.from('collection_visits').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    load();
  }

  return (
    <section className="panel">
      <h2>Mes visites planifiées</h2>
      <table>
        <thead>
          <tr>
            <th>Membre</th>
            <th>Date prévue</th>
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>
          {visits.map((v) => (
            <tr key={v.id}>
              <td>{v.members?.full_name}</td>
              <td>{v.planned_on || '—'}</td>
              <td>
                <select value={v.status} onChange={(e) => updateStatus(v.id, e.target.value as VisitStatus)}>
                  {Object.entries(labels).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
          {!visits.length && (
            <tr>
              <td colSpan={3}>Aucune visite planifiée.</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
