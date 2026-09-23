import { STATUS_LABELS, type PledgeStatus } from '../lib/types';

const TONE: Record<PledgeStatus, string> = {
  non_commence: 'grey',
  paiement_faible: 'orange',
  a_moitie: 'orange',
  paiement_avance: 'blue',
  solde: 'green',
  en_retard: 'red',
  annule: 'grey',
};

export function StatusBadge({ status }: { status: PledgeStatus }) {
  return <span className={`badge badge-${TONE[status]}`}>{STATUS_LABELS[status]}</span>;
}
