import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Modal } from '../components/Modal';
import { useHasRole } from '../lib/auth';
import type { Member, Neighborhood, ChurchGroup } from '../lib/types';

export default function Members() {
  const [q, setQ] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [groups, setGroups] = useState<ChurchGroup[]>([]);
  const [editing, setEditing] = useState<Partial<Member> | null>(null);
  const canWrite = useHasRole('super_admin', 'admin', 'treasurer');

  async function find() {
    let query = supabase
      .from('members')
      .select('id,member_no,full_name,phone,status,neighborhood_id,group_id,sex,address,avenue,notes,neighborhoods(name),church_groups(name)')
      .neq('status', 'archived')
      .order('full_name')
      .limit(80);
    if (q) query = query.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%,member_no.ilike.%${q}%`);
    const { data } = await query;
    setMembers((data || []) as unknown as Member[]);
  }

  useEffect(() => {
    find();
    supabase.from('neighborhoods').select('id,name,commune').order('name').then(({ data }) => setNeighborhoods((data || []) as Neighborhood[]));
    supabase.from('church_groups').select('id,name').order('name').then(({ data }) => setGroups((data || []) as ChurchGroup[]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    if (!editing) return;
    const payload = {
      full_name: editing.full_name,
      sex: editing.sex || null,
      phone: editing.phone || null,
      address: editing.address || null,
      avenue: editing.avenue || null,
      neighborhood_id: editing.neighborhood_id || null,
      group_id: editing.group_id || null,
      notes: editing.notes || null,
    };
    if (editing.id) {
      await supabase.from('members').update(payload).eq('id', editing.id);
    } else {
      const memberNo = `MEM-${new Date().getFullYear()}-${Math.floor(Math.random() * 900000 + 100000)}`;
      await supabase.from('members').insert({ ...payload, member_no: memberNo });
    }
    setEditing(null);
    find();
  }

  async function archive(id: string) {
    if (!confirm("Archiver ce membre ? Il restera consultable mais n'apparaîtra plus dans les listes actives.")) return;
    await supabase.rpc('archive_member', { p_member: id });
    find();
  }

  return (
    <>
      <header>
        <div>
          <h1>Membres</h1>
          <p>Registre central, sans suppression définitive.</p>
        </div>
        {canWrite && (
          <button className="primary" onClick={() => setEditing({})}>
            <Plus size={16} /> Ajouter un membre
          </button>
        )}
      </header>

      <div className="toolbar">
        <Search size={18} />
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && find()} placeholder="Nom, téléphone ou matricule" />
        <button onClick={find}>Rechercher</button>
      </div>

      <section className="panel">
        <table>
          <thead>
            <tr>
              <th>Matricule</th>
              <th>Nom</th>
              <th>Téléphone</th>
              <th>Quartier</th>
              <th>Groupe</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>{m.member_no}</td>
                <td>
                  <Link to={`/members/${m.id}`}>{m.full_name}</Link>
                </td>
                <td>{m.phone || '—'}</td>
                <td>{m.neighborhoods?.name || '—'}</td>
                <td>{m.church_groups?.name || '—'}</td>
                <td className="row-actions">
                  {canWrite && (
                    <>
                      <button onClick={() => setEditing(m)}>Modifier</button>
                      <button onClick={() => archive(m.id)}>Archiver</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {!members.length && (
              <tr>
                <td colSpan={6}>Aucun membre trouvé.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {editing && (
        <Modal title={editing.id ? 'Modifier le membre' : 'Ajouter un membre'} onClose={() => setEditing(null)}>
          <div className="form-grid">
            <label>
              Nom complet
              <input value={editing.full_name || ''} onChange={(e) => setEditing({ ...editing, full_name: e.target.value })} />
            </label>
            <label>
              Sexe
              <select value={editing.sex || ''} onChange={(e) => setEditing({ ...editing, sex: e.target.value })}>
                <option value="">—</option>
                <option value="M">Masculin</option>
                <option value="F">Féminin</option>
                <option value="other">Autre</option>
              </select>
            </label>
            <label>
              Téléphone
              <input value={editing.phone || ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
            </label>
            <label>
              Quartier
              <select value={editing.neighborhood_id || ''} onChange={(e) => setEditing({ ...editing, neighborhood_id: e.target.value })}>
                <option value="">—</option>
                {neighborhoods.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Groupe / département
              <select value={editing.group_id || ''} onChange={(e) => setEditing({ ...editing, group_id: e.target.value })}>
                <option value="">—</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Avenue / rue
              <input value={editing.avenue || ''} onChange={(e) => setEditing({ ...editing, avenue: e.target.value })} />
            </label>
            <label className="span-2">
              Adresse / repère
              <input value={editing.address || ''} onChange={(e) => setEditing({ ...editing, address: e.target.value })} />
            </label>
            <label className="span-2">
              Notes administratives
              <textarea value={editing.notes || ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
            </label>
          </div>
          <footer className="modal-actions">
            <button onClick={() => setEditing(null)}>Annuler</button>
            <button className="primary" onClick={save} disabled={!editing.full_name}>
              Enregistrer
            </button>
          </footer>
        </Modal>
      )}
    </>
  );
}
