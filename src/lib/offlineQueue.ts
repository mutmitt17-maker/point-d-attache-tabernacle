import { openDB, type IDBPDatabase } from 'idb';
import { supabase } from './supabase';

export interface QueuedPayment {
  client_id: string; // uuid v4 généré sur l'appareil — clé d'idempotence
  pledge_id: string;
  amount: number;
  currency: string;
  method: string;
  transaction_ref?: string | null;
  note?: string | null;
  member_signature_path?: string | null;
  collector_signature_path?: string | null;
  proof_path?: string | null;
  recorded_at: string; // ISO — horodatage local au moment de la saisie hors-ligne
  synced: boolean;
  error?: string;
}

const DB_NAME = 'eglise-collecte-offline';
const STORE = 'payments';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'client_id' });
        }
      },
    });
  }
  return dbPromise;
}

export function newClientId(): string {
  return crypto.randomUUID();
}

/** Enregistre un paiement localement, qu'il y ait ou non une connexion. */
export async function queuePayment(payment: Omit<QueuedPayment, 'synced'>) {
  const db = await getDb();
  await db.put(STORE, { ...payment, synced: false });
}

export async function listQueuedPayments(): Promise<QueuedPayment[]> {
  const db = await getDb();
  return db.getAll(STORE);
}

export async function pendingCount(): Promise<number> {
  const rows = await listQueuedPayments();
  return rows.filter((r) => !r.synced).length;
}

/**
 * Tente de synchroniser toutes les entrées non envoyées. Le RPC create_payment
 * est idempotent sur client_id : un même paiement rejoué deux fois ne crée
 * jamais deux écritures financières.
 */
export async function syncQueuedPayments(): Promise<{ ok: number; failed: number }> {
  const db = await getDb();
  const rows: QueuedPayment[] = await db.getAll(STORE);
  let ok = 0;
  let failed = 0;
  for (const row of rows) {
    if (row.synced) continue;
    const { error } = await supabase.rpc('create_payment', {
      p_pledge: row.pledge_id,
      p_client_id: row.client_id,
      p_amount: row.amount,
      p_currency: row.currency,
      p_method: row.method,
      p_ref: row.transaction_ref ?? null,
      p_note: row.note ?? null,
      p_member_sig: row.member_signature_path ?? null,
      p_collector_sig: row.collector_signature_path ?? null,
      p_proof: row.proof_path ?? null,
      p_offline_at: row.recorded_at,
    });
    if (error) {
      failed += 1;
      await db.put(STORE, { ...row, error: error.message });
    } else {
      ok += 1;
      await db.put(STORE, { ...row, synced: true, error: undefined });
    }
  }
  return { ok, failed };
}

export function isOnline() {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}
