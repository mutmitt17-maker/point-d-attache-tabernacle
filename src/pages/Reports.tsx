import { useState } from 'react';
import { Download } from 'lucide-react';
import { supabase } from '../lib/supabase';

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n');
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  const csv = toCsv(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const REPORTS: { key: string; label: string; run: () => Promise<Record<string, unknown>[]> }[] = [
  {
    key: 'fully_paid',
    label: 'Membres ayant totalement payé',
    run: async () => {
      const { data } = await supabase.from('pledges').select('members(full_name,phone),campaigns(name),amount,paid_amount').eq('status', 'solde');
      return (data || []).map((r: any) => ({ membre: r.members?.full_name, telephone: r.members?.phone, campagne: r.campaigns?.name, souscrit: r.amount, paye: r.paid_amount }));
    },
  },
  {
    key: 'unpaid',
    label: "Membres n'ayant rien payé",
    run: async () => {
      const { data } = await supabase.from('pledges').select('members(full_name,phone),campaigns(name),amount,balance').eq('status', 'non_commence');
      return (data || []).map((r: any) => ({ membre: r.members?.full_name, telephone: r.members?.phone, campagne: r.campaigns?.name, souscrit: r.amount, solde: r.balance }));
    },
  },
  {
    key: 'overdue',
    label: 'Membres en retard',
    run: async () => {
      const { data } = await supabase.from('pledges').select('members(full_name,phone),campaigns(name),balance,due_on').eq('status', 'en_retard');
      return (data || []).map((r: any) => ({ membre: r.members?.full_name, telephone: r.members?.phone, campagne: r.campaigns?.name, solde: r.balance, echeance: r.due_on }));
    },
  },
  {
    key: 'by_neighborhood',
    label: 'Rapport par quartier',
    run: async () => {
      const { data } = await supabase.from('pledges').select('amount,paid_amount,balance,members(neighborhoods(name))').neq('status', 'annule');
      const grouped: Record<string, { souscrit: number; paye: number; solde: number }> = {};
      for (const r of (data || []) as any[]) {
        const name = r.members?.neighborhoods?.name || 'Sans quartier';
        grouped[name] ??= { souscrit: 0, paye: 0, solde: 0 };
        grouped[name].souscrit += Number(r.amount);
        grouped[name].paye += Number(r.paid_amount);
        grouped[name].solde += Number(r.balance);
      }
      return Object.entries(grouped).map(([quartier, v]) => ({ quartier, ...v }));
    },
  },
  {
    key: 'by_collector',
    label: 'Rapport par percepteur',
    run: async () => {
      const { data } = await supabase.from('payments').select('amount,profiles!payments_collector_id_fkey(full_name)').eq('state', 'validated');
      const grouped: Record<string, { nombre: number; total: number }> = {};
      for (const r of (data || []) as any[]) {
        const name = r.profiles?.full_name || 'Inconnu';
        grouped[name] ??= { nombre: 0, total: 0 };
        grouped[name].nombre += 1;
        grouped[name].total += Number(r.amount);
      }
      return Object.entries(grouped).map(([percepteur, v]) => ({ percepteur, ...v }));
    },
  },
  {
    key: 'mobile_money',
    label: 'Paiements Mobile Money',
    run: async () => {
      const { data } = await supabase
        .from('payments')
        .select('receipt_no,amount,currency,method,transaction_ref,occurred_at,pledges(members(full_name))')
        .in('method', ['mpesa', 'airtel_money', 'orange_money'])
        .eq('state', 'validated');
      return (data || []).map((r: any) => ({
        recu: r.receipt_no,
        membre: r.pledges?.members?.full_name,
        montant: r.amount,
        devise: r.currency,
        moyen: r.method,
        reference: r.transaction_ref,
        date: r.occurred_at,
      }));
    },
  },
  {
    key: 'void_requests',
    label: 'Annulations et corrections',
    run: async () => {
      const { data } = await supabase.from('payments').select('receipt_no,amount,state,void_reason,voided_at').in('state', ['void_requested', 'voided']);
      return (data || []) as unknown as Record<string, unknown>[];
    },
  },
];

export default function Reports() {
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string) {
    const report = REPORTS.find((r) => r.key === key);
    if (!report) return;
    setBusy(key);
    try {
      const rows = await report.run();
      if (!rows.length) {
        alert('Aucune donnée pour ce rapport.');
        return;
      }
      downloadCsv(`${key}-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <header>
        <div>
          <h1>Rapports</h1>
          <p>Exportez les listes essentielles en CSV, ouvrables dans Excel.</p>
        </div>
      </header>
      <section className="panel">
        <div className="report-grid">
          {REPORTS.map((r) => (
            <button key={r.key} onClick={() => run(r.key)} disabled={busy === r.key}>
              <Download size={16} /> {r.label}
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
