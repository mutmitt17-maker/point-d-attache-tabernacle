import { useEffect, useState } from 'react';
import { Search, Wifi, WifiOff, CloudUpload } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { money } from '../lib/money';
import { SignaturePad } from '../components/SignaturePad';
import { StatusBadge } from '../components/StatusBadge';
import { uploadDataUrl, uploadFile } from '../lib/storage';
import { queuePayment, newClientId, syncQueuedPayments, pendingCount, isOnline } from '../lib/offlineQueue';
import { downloadReceipt } from '../lib/receipt';
import { useAuth } from '../lib/auth';
import { METHOD_LABELS, type Member, type Pledge, type PaymentMethod } from '../lib/types';

export default function Payments() {
  const { profile } = useAuth();
  const [query, setQuery] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [member, setMember] = useState<Member | null>(null);
  const [pledges, setPledges] = useState<Pledge[]>([]);
  const [pledge, setPledge] = useState<Pledge | null>(null);

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [memberSig, setMemberSig] = useState<string | null>(null);
  const [collectorSig, setCollectorSig] = useState<string | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [online, setOnline] = useState(isOnline());
  const [queued, setQueued] = useState(0);

  useEffect(() => {
    const upd = () => setOnline(isOnline());
    window.addEventListener('online', upd);
    window.addEventListener('offline', upd);
    refreshQueue();
    return () => {
      window.removeEventListener('online', upd);
      window.removeEventListener('offline', upd);
    };
  }, []);

  async function refreshQueue() {
    setQueued(await pendingCount());
  }

  async function searchMembers() {
    if (query.length < 2) return setMembers([]);
    const { data } = await supabase
      .from('members')
      .select('id,member_no,full_name,phone,neighborhoods(name)')
      .eq('status', 'active')
      .or(`full_name.ilike.%${query}%,phone.ilike.%${query}%,member_no.ilike.%${query}%`)
      .limit(10);
    setMembers((data || []) as unknown as Member[]);
  }

  async function pickMember(m: Member) {
    setMember(m);
    setMembers([]);
    setPledge(null);
    const { data } = await supabase
      .from('pledges')
      .select('id,amount,currency,paid_amount,balance,status,campaigns(name)')
      .eq('member_id', m.id)
      .in('status', ['non_commence', 'paiement_faible', 'a_moitie', 'paiement_avance', 'en_retard'])
      .order('balance', { ascending: false });
    setPledges((data || []) as unknown as Pledge[]);
  }

  function resetForm() {
    setAmount('');
    setReference('');
    setNote('');
    setMemberSig(null);
    setCollectorSig(null);
    setProofFile(null);
  }

  async function confirmPayment() {
    if (!pledge || !amount || Number(amount) <= 0) return;
    setBusy(true);
    setMessage(null);
    const clientId = newClientId();
    const recordedAt = new Date().toISOString();
    try {
      let memberSigPath: string | null = null;
      let collectorSigPath: string | null = null;
      let proofPath: string | null = null;

      if (online) {
        if (memberSig) memberSigPath = await uploadDataUrl('signatures', memberSig, 'membre.png');
        if (collectorSig) collectorSigPath = await uploadDataUrl('signatures', collectorSig, 'percepteur.png');
        if (proofFile) proofPath = await uploadFile('payment-proofs', proofFile);

        const { data: paymentId, error } = await supabase.rpc('create_payment', {
          p_pledge: pledge.id,
          p_client_id: clientId,
          p_amount: Number(amount),
          p_currency: pledge.currency,
          p_method: method,
          p_ref: reference || null,
          p_note: note || null,
          p_member_sig: memberSigPath,
          p_collector_sig: collectorSigPath,
          p_proof: proofPath,
          p_offline_at: null,
        });
        if (error) throw error;

        const { data: payment } = await supabase.from('payments').select('receipt_no,verification_token,occurred_at').eq('id', paymentId).maybeSingle();
        setMessage(`Paiement enregistré — reçu ${payment?.receipt_no ?? ''}.`);
        if (payment) {
          await downloadReceipt({
            receiptNo: payment.receipt_no,
            churchName: "Eglise",
            memberName: member?.full_name ?? '',
            campaignName: pledge.campaigns?.name ?? '',
            amount: Number(amount),
            currency: pledge.currency,
            totalPaid: pledge.paid_amount + Number(amount),
            balance: Math.max(pledge.balance - Number(amount), 0),
            method: METHOD_LABELS[method],
            occurredAt: payment.occurred_at,
            collectorName: profile?.full_name ?? '',
            verificationToken: payment.verification_token,
          });
        }
      } else {
        // Mode hors-ligne : les signatures restent en mémoire locale (data URL) et
        // seront envoyées vers Storage au moment de la synchronisation manuelle.
        await queuePayment({
          client_id: clientId,
          pledge_id: pledge.id,
          amount: Number(amount),
          currency: pledge.currency,
          method,
          transaction_ref: reference || null,
          note: note || null,
          member_signature_path: memberSig,
          collector_signature_path: collectorSig,
          proof_path: null,
          recorded_at: recordedAt,
        });
        setMessage('Aucune connexion : le paiement a été enregistré sur cet appareil et sera synchronisé automatiquement.');
      }
      resetForm();
      await pickMember(member!);
      refreshQueue();
    } catch (err) {
      setMessage(err instanceof Error ? `Erreur : ${err.message}` : 'Erreur inattendue lors de l\'enregistrement.');
    } finally {
      setBusy(false);
    }
  }

  async function sync() {
    setBusy(true);
    const { ok, failed } = await syncQueuedPayments();
    setMessage(`${ok} paiement(s) synchronisé(s)${failed ? `, ${failed} en échec (seront retentés)` : ''}.`);
    refreshQueue();
    setBusy(false);
  }

  const projectedBalance = pledge && amount ? Math.max(pledge.balance - Number(amount), 0) : pledge?.balance ?? 0;

  return (
    <>
      <header>
        <div>
          <h1>Encaissements</h1>
          <p>Recherchez le membre, sélectionnez sa souscription active, encaissez.</p>
        </div>
        <div className="connectivity">
          {online ? (
            <span className="badge badge-green">
              <Wifi size={13} /> En ligne
            </span>
          ) : (
            <span className="badge badge-red">
              <WifiOff size={13} /> Hors ligne
            </span>
          )}
          {queued > 0 && (
            <button onClick={sync} disabled={busy || !online}>
              <CloudUpload size={14} /> Synchroniser ({queued})
            </button>
          )}
        </div>
      </header>

      {message && <p className="form-info">{message}</p>}

      {!member && (
        <div className="toolbar">
          <Search size={18} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && searchMembers()} placeholder="Nom, téléphone ou matricule du membre" />
          <button onClick={searchMembers}>Rechercher</button>
        </div>
      )}

      {!!members.length && (
        <section className="panel">
          <table>
            <thead>
              <tr>
                <th>Nom</th>
                <th>Téléphone</th>
                <th>Quartier</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td>{m.full_name}</td>
                  <td>{m.phone || '—'}</td>
                  <td>{m.neighborhoods?.name || '—'}</td>
                  <td>
                    <button className="primary" onClick={() => pickMember(m)}>
                      Choisir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {member && !pledge && (
        <section className="panel">
          <h2>Souscriptions actives de {member.full_name}</h2>
          <table>
            <thead>
              <tr>
                <th>Campagne</th>
                <th>Souscrit</th>
                <th>Solde</th>
                <th>Statut</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pledges.map((p) => (
                <tr key={p.id}>
                  <td>{p.campaigns?.name}</td>
                  <td>{money(p.amount, p.currency)}</td>
                  <td>{money(p.balance, p.currency)}</td>
                  <td>
                    <StatusBadge status={p.status} />
                  </td>
                  <td>
                    <button className="primary" onClick={() => setPledge(p)}>
                      Encaisser
                    </button>
                  </td>
                </tr>
              ))}
              {!pledges.length && (
                <tr>
                  <td colSpan={5}>Aucune souscription active pour ce membre.</td>
                </tr>
              )}
            </tbody>
          </table>
          <button
            onClick={() => {
              setMember(null);
              setPledges([]);
            }}
          >
            Changer de membre
          </button>
        </section>
      )}

      {member && pledge && (
        <section className="panel payment-form">
          <h2>
            {member.full_name} — {pledge.campaigns?.name}
          </h2>
          <div className="pledge-summary">
            <span>Souscrit : {money(pledge.amount, pledge.currency)}</span>
            <span>Déjà payé : {money(pledge.paid_amount, pledge.currency)}</span>
            <span>Solde avant paiement : {money(pledge.balance, pledge.currency)}</span>
          </div>

          <div className="form-grid">
            <label>
              Montant reçu aujourd'hui ({pledge.currency})
              <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
            </label>
            <label>
              Moyen de paiement
              <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                {Object.entries(METHOD_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Référence de transaction
              <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Si Mobile Money / banque" />
            </label>
            <label>
              Preuve (photo du reçu / capture Mobile Money)
              <input type="file" accept="image/*" capture="environment" onChange={(e) => setProofFile(e.target.files?.[0] ?? null)} disabled={!online} />
            </label>
            <label className="span-2">
              Notes
              <input value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </div>

          <div className="two-col">
            <SignaturePad label="Signature du membre" onChange={setMemberSig} />
            <SignaturePad label="Validation du percepteur" onChange={setCollectorSig} />
          </div>

          <p className="balance-preview">Solde après paiement : <strong>{money(projectedBalance, pledge.currency)}</strong></p>

          <div className="modal-actions">
            <button onClick={() => setPledge(null)}>Retour</button>
            <button className="primary" onClick={confirmPayment} disabled={busy || !amount || Number(amount) <= 0}>
              Enregistrer et générer reçu
            </button>
          </div>
        </section>
      )}
    </>
  );
}
