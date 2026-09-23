import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ROLE_LABELS, type AppRole, type Profile } from '../lib/types';

export default function Users() {
  const [rows, setRows] = useState<Profile[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from('profiles').select('id,church_id,full_name,role,active').order('full_name');
    setRows((data || []) as Profile[]);
  }

  useEffect(() => {
    load();
  }, []);

  async function updateRole(id: string, role: AppRole) {
    await supabase.from('profiles').update({ role }).eq('id', id);
    load();
  }

  async function toggleActive(p: Profile) {
    await supabase.from('profiles').update({ active: !p.active }).eq('id', p.id);
    load();
  }

  return (
    <>
      <header>
        <div>
          <h1>Utilisateurs</h1>
          <p>Chaque percepteur, administrateur ou trésorier doit posséder son propre compte.</p>
        </div>
      </header>

      <section className="panel">
        <p>
          Pour créer un nouvel utilisateur : ajoutez-le dans Supabase Auth (Dashboard → Authentication), puis revenez ici pour lui
          attribuer un rôle. La création de comptes se fait volontairement hors de l'application cliente afin de ne jamais exposer
          la clé <code>service_role</code>.
        </p>
        {notice && <p className="form-info">{notice}</p>}
        <table>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Rôle</th>
              <th>Statut</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.full_name}</td>
                <td>
                  <select value={p.role} onChange={(e) => updateRole(p.id, e.target.value as AppRole)}>
                    {Object.entries(ROLE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{p.active ? 'Actif' : 'Désactivé'}</td>
                <td>
                  <button onClick={() => toggleActive(p)}>{p.active ? 'Désactiver' : 'Réactiver'}</button>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={4}>Aucun profil trouvé.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
