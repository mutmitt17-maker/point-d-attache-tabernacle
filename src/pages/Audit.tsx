import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface AuditRow {
  id: number;
  action: string;
  entity: string;
  entity_id: string | null;
  occurred_at: string;
  metadata: Record<string, unknown>;
  profiles?: { full_name: string } | null;
}

export default function Audit() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');

  async function search() {
    let query = supabase
      .from('audit_logs')
      .select('id,action,entity,entity_id,occurred_at,metadata,profiles!audit_logs_actor_id_fkey(full_name)')
      .order('occurred_at', { ascending: false })
      .limit(100);
    if (entity) query = query.eq('entity', entity);
    if (action) query = query.eq('action', action);
    const { data } = await query;
    setRows((data || []) as unknown as AuditRow[]);
  }

  useEffect(() => {
    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <header>
        <div>
          <h1>Journal d'audit</h1>
          <p>Toutes les opérations sensibles sont journalisées automatiquement et ne peuvent pas être modifiées.</p>
        </div>
      </header>

      <div className="filters">
        <input placeholder="Filtrer par table (ex : payments)" value={entity} onChange={(e) => setEntity(e.target.value)} />
        <input placeholder="Filtrer par action (ex : CREATE_PAYMENT)" value={action} onChange={(e) => setAction(e.target.value)} />
        <button className="primary" onClick={search}>
          Filtrer
        </button>
      </div>

      <section className="panel">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Utilisateur</th>
              <th>Action</th>
              <th>Table</th>
              <th>Détail</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.occurred_at).toLocaleString('fr-CD')}</td>
                <td>{r.profiles?.full_name ?? '—'}</td>
                <td>{r.action}</td>
                <td>{r.entity}</td>
                <td className="mono-cell">{JSON.stringify(r.metadata)}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5}>Aucune entrée pour ces filtres.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
