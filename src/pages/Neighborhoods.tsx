import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useHasRole } from '../lib/auth';
import type { Neighborhood, ChurchGroup } from '../lib/types';

export default function Neighborhoods() {
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [groups, setGroups] = useState<ChurchGroup[]>([]);
  const [newNeighborhood, setNewNeighborhood] = useState('');
  const [newCommune, setNewCommune] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const canWrite = useHasRole('super_admin', 'admin', 'treasurer');

  async function load() {
    const { data: n } = await supabase.from('neighborhoods').select('id,name,commune').order('name');
    setNeighborhoods((n || []) as Neighborhood[]);
    const { data: g } = await supabase.from('church_groups').select('id,name').order('name');
    setGroups((g || []) as ChurchGroup[]);
  }

  useEffect(() => {
    load();
  }, []);

  async function addNeighborhood() {
    if (!newNeighborhood.trim()) return;
    await supabase.from('neighborhoods').insert({ name: newNeighborhood.trim(), commune: newCommune.trim() || null });
    setNewNeighborhood('');
    setNewCommune('');
    load();
  }

  async function addGroup() {
    if (!newGroup.trim()) return;
    await supabase.from('church_groups').insert({ name: newGroup.trim() });
    setNewGroup('');
    load();
  }

  return (
    <>
      <header>
        <div>
          <h1>Quartiers &amp; groupes</h1>
          <p>Données de référence utilisées pour le filtrage et le recouvrement.</p>
        </div>
      </header>

      <div className="two-col">
        <section className="panel">
          <h2>Quartiers</h2>
          {canWrite && (
            <div className="toolbar">
              <input placeholder="Nom du quartier" value={newNeighborhood} onChange={(e) => setNewNeighborhood(e.target.value)} />
              <input placeholder="Commune (facultatif)" value={newCommune} onChange={(e) => setNewCommune(e.target.value)} />
              <button className="primary" onClick={addNeighborhood}>
                <Plus size={15} /> Ajouter
              </button>
            </div>
          )}
          <table>
            <thead>
              <tr>
                <th>Nom</th>
                <th>Commune</th>
              </tr>
            </thead>
            <tbody>
              {neighborhoods.map((n) => (
                <tr key={n.id}>
                  <td>{n.name}</td>
                  <td>{n.commune || '—'}</td>
                </tr>
              ))}
              {!neighborhoods.length && (
                <tr>
                  <td colSpan={2}>Aucun quartier enregistré.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="panel">
          <h2>Groupes / départements</h2>
          {canWrite && (
            <div className="toolbar">
              <input placeholder="Nom du groupe" value={newGroup} onChange={(e) => setNewGroup(e.target.value)} />
              <button className="primary" onClick={addGroup}>
                <Plus size={15} /> Ajouter
              </button>
            </div>
          )}
          <table>
            <thead>
              <tr>
                <th>Nom</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id}>
                  <td>{g.name}</td>
                </tr>
              ))}
              {!groups.length && (
                <tr>
                  <td>Aucun groupe enregistré.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
