import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Modal } from '../components/Modal';
import { money } from '../lib/money';
import { useHasRole } from '../lib/auth';
import type { Campaign, CampaignState, Member, Pledge } from '../lib/types';

const STATE_LABELS: Record<CampaignState, string> = {
  draft: 'Brouillon',
  active: 'Active',
  suspended: 'Suspendue',
  closed: 'Clôturée',
  archived: 'Archivée',
};

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [editing, setEditing] = useState<Partial<Campaign> | null>(null);
  const [openCampaign, setOpenCampaign] = useState<Campaign | null>(null);
  const canWrite = useHasRole('super_admin', 'admin', 'treasurer');

  async function load() {
    const { data } = await supabase.from('campaigns').select('*').order('starts_on', { ascending: false });
    setCampaigns((data || []) as Campaign[]);
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (!editing?.name) return;
    const payload = {
      name: editing.name,
      description: editing.description || null,
      target_amount: editing.target_amount || null,
      currency: editing.currency || 'USD',
      starts_on: editing.starts_on || null,
      due_on: editing.due_on || null,
      state: editing.state || 'draft',
      allow_overpayment: editing.allow_overpayment || false,
    };
    if (editing.id) await supabase.from('campaigns').update(payload).eq('id', editing.id);
    else await supabase.from('campaigns').insert(payload);
    setEditing(null);
    load();
  }

  return (
    <>
      <header>
        <div>
          <h1>Campagnes &amp; souscriptions</h1>
          <p>Une campagne regroupe les souscriptions individuelles des membres.</p>
        </div>
        {canWrite && (
          <button className="primary" onClick={() => setEditing({ currency: 'USD', state: 'draft' })}>
            <Plus size={16} /> Nouvelle campagne
          </button>
        )}
      </header>

      <section className="panel">
        <table>
          <thead>
            <tr>
              <th>Campagne</th>
              <th>Cible</th>
              <th>Échéance</th>
              <th>État</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.target_amount ? money(c.target_amount, c.currency) : '—'}</td>
                <td>{c.due_on || '—'}</td>
                <td>
                  <span className="badge badge-blue">{STATE_LABELS[c.state]}</span>
                </td>
                <td className="row-actions">
                  <button onClick={() => setOpenCampaign(c)}>Souscriptions</button>
                  {canWrite && <button onClick={() => setEditing(c)}>Modifier</button>}
                </td>
              </tr>
            ))}
            {!campaigns.length && (
              <tr>
                <td colSpan={5}>Aucune campagne. Créez-en une pour commencer à collecter.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {editing && (
        <Modal title={editing.id ? 'Modifier la campagne' : 'Nouvelle campagne'} onClose={() => setEditing(null)}>
          <div className="form-grid">
            <label className="span-2">
              Nom de la campagne
              <input value={editing.name || ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </label>
            <label className="span-2">
              Description / objectif
              <textarea value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </label>
            <label>
              Montant cible (facultatif)
              <input type="number" min={0} value={editing.target_amount ?? ''} onChange={(e) => setEditing({ ...editing, target_amount: e.target.value ? Number(e.target.value) : null })} />
            </label>
            <label>
              Devise
              <select value={editing.currency || 'USD'} onChange={(e) => setEditing({ ...editing, currency: e.target.value })}>
                <option value="USD">USD</option>
                <option value="CDF">CDF</option>
              </select>
            </label>
            <label>
              Date de début
              <input type="date" value={editing.starts_on || ''} onChange={(e) => setEditing({ ...editing, starts_on: e.target.value })} />
            </label>
            <label>
              Date limite de paiement
              <input type="date" value={editing.due_on || ''} onChange={(e) => setEditing({ ...editing, due_on: e.target.value })} />
            </label>
            <label>
              État
              <select value={editing.state || 'draft'} onChange={(e) => setEditing({ ...editing, state: e.target.value as CampaignState })}>
                {Object.entries(STATE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={!!editing.allow_overpayment} onChange={(e) => setEditing({ ...editing, allow_overpayment: e.target.checked })} />
              Autoriser le dépassement de souscription
            </label>
          </div>
          <footer className="modal-actions">
            <button onClick={() => setEditing(null)}>Annuler</button>
            <button className="primary" onClick={save} disabled={!editing.name}>
              Enregistrer
            </button>
          </footer>
        </Modal>
      )}

      {openCampaign && <PledgesPanel campaign={openCampaign} onClose={() => setOpenCampaign(null)} canWrite={canWrite} />}
    </>
  );
}

function PledgesPanel({ campaign, onClose, canWrite }: { campaign: Campaign; onClose: () => void; canWrite: boolean }) {
  const [pledges, setPledges] = useState<Pledge[]>([]);
  const [creating, setCreating] = useState(false);
  const [memberQuery, setMemberQuery] = useState('');
  const [memberOptions, setMemberOptions] = useState<Member[]>([]);
  const [form, setForm] = useState<{ member_id: string; amount: string; due_on: string; note: string }>({ member_id: '', amount: '', due_on: '', note: '' });

  async function load() {
    const { data } = await supabase
      .from('pledges')
      .select('id,amount,currency,paid_amount,balance,status,due_on,member_id,members(full_name,phone)')
      .eq('campaign_id', campaign.id)
      .order('balance', { ascending: false });
    setPledges((data || []) as unknown as Pledge[]);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign.id]);

  async function searchMembers(term: string) {
    setMemberQuery(term);
    if (term.length < 2) return setMemberOptions([]);
    const { data } = await supabase.from('members').select('id,member_no,full_name,phone').ilike('full_name', `%${term}%`).eq('status', 'active').limit(8);
    setMemberOptions((data || []) as Member[]);
  }

  async function createPledge() {
    if (!form.member_id || !form.amount) return;
    await supabase.from('pledges').insert({
      member_id: form.member_id,
      campaign_id: campaign.id,
      amount: Number(form.amount),
      currency: campaign.currency,
      due_on: form.due_on || null,
      note: form.note || null,
      balance: Number(form.amount),
    });
    setCreating(false);
    setForm({ member_id: '', amount: '', due_on: '', note: '' });
    load();
  }

  return (
    <Modal title={`Souscriptions — ${campaign.name}`} onClose={onClose} wide>
      {canWrite && (
        <div className="modal-actions" style={{ marginBottom: 14 }}>
          <button className="primary" onClick={() => setCreating(true)}>
            <Plus size={15} /> Nouvelle souscription
          </button>
        </div>
      )}
      <table>
        <thead>
          <tr>
            <th>Membre</th>
            <th>Souscrit</th>
            <th>Payé</th>
            <th>Solde</th>
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>
          {pledges.map((p) => (
            <tr key={p.id}>
              <td>{p.members?.full_name}</td>
              <td>{money(p.amount, p.currency)}</td>
              <td>{money(p.paid_amount, p.currency)}</td>
              <td>{money(p.balance, p.currency)}</td>
              <td>{p.status}</td>
            </tr>
          ))}
          {!pledges.length && (
            <tr>
              <td colSpan={5}>Aucune souscription pour cette campagne.</td>
            </tr>
          )}
        </tbody>
      </table>

      {creating && (
        <div className="inline-form">
          <label>
            Membre
            <input value={memberQuery} onChange={(e) => searchMembers(e.target.value)} placeholder="Rechercher un nom…" />
            {!!memberOptions.length && (
              <ul className="autocomplete">
                {memberOptions.map((m) => (
                  <li key={m.id} onClick={() => { setForm({ ...form, member_id: m.id }); setMemberQuery(m.full_name); setMemberOptions([]); }}>
                    {m.full_name} {m.phone ? `— ${m.phone}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </label>
          <label>
            Montant souscrit ({campaign.currency})
            <input type="number" min={0} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </label>
          <label>
            Échéance individuelle
            <input type="date" value={form.due_on} onChange={(e) => setForm({ ...form, due_on: e.target.value })} />
          </label>
          <label>
            Commentaire / engagement
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </label>
          <div className="modal-actions">
            <button onClick={() => setCreating(false)}>Annuler</button>
            <button className="primary" onClick={createPledge} disabled={!form.member_id || !form.amount}>
              Créer la souscription
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
