export type AppRole =
  | 'super_admin'
  | 'admin'
  | 'treasurer'
  | 'collector'
  | 'neighborhood_manager'
  | 'auditor'
  | 'member';

export type PledgeStatus =
  | 'non_commence'
  | 'paiement_faible'
  | 'a_moitie'
  | 'paiement_avance'
  | 'solde'
  | 'en_retard'
  | 'annule';

export type PaymentState = 'pending' | 'validated' | 'void_requested' | 'voided';
export type PaymentMethod = 'cash' | 'mpesa' | 'airtel_money' | 'orange_money' | 'bank' | 'other';
export type MemberStatus = 'active' | 'absent' | 'transferred' | 'deceased' | 'suspended' | 'archived';
export type CampaignState = 'draft' | 'active' | 'suspended' | 'closed' | 'archived';
export type CashState = 'open' | 'submitted' | 'validated' | 'closed';
export type VisitStatus = 'a_faire' | 'visite' | 'absent' | 'promesse' | 'paye_partiel' | 'refus' | 'a_reprogrammer';

export interface Profile {
  id: string;
  church_id: string;
  full_name: string;
  role: AppRole;
  active: boolean;
}

export interface Neighborhood {
  id: string;
  name: string;
  commune: string | null;
}

export interface ChurchGroup {
  id: string;
  name: string;
}

export interface Member {
  id: string;
  member_no: string;
  full_name: string;
  sex: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  avenue: string | null;
  neighborhood_id: string | null;
  group_id: string | null;
  status: MemberStatus;
  notes: string | null;
  neighborhoods?: { name: string } | null;
  church_groups?: { name: string } | null;
}

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  target_amount: number | null;
  currency: string;
  starts_on: string | null;
  due_on: string | null;
  state: CampaignState;
  allow_overpayment: boolean;
}

export interface Pledge {
  id: string;
  member_id: string;
  campaign_id: string;
  amount: number;
  currency: string;
  due_on: string | null;
  paid_amount: number;
  balance: number;
  status: PledgeStatus;
  note: string | null;
  members?: { full_name: string; phone: string | null } | null;
  campaigns?: { name: string } | null;
}

export interface Payment {
  id: string;
  pledge_id: string;
  collector_id: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  transaction_ref: string | null;
  receipt_no: string;
  state: PaymentState;
  verification_token: string;
  occurred_at: string;
  pledges?: { members?: { full_name: string } | null; campaigns?: { name: string } | null } | null;
}

export interface CashSession {
  id: string;
  collector_id: string;
  opened_at: string;
  closed_at: string | null;
  state: CashState;
  declared_cash: number | null;
  variance_note: string | null;
}

export const STATUS_LABELS: Record<PledgeStatus, string> = {
  non_commence: 'Non commencé',
  paiement_faible: 'Paiement faible',
  a_moitie: 'À moitié',
  paiement_avance: 'Paiement avancé',
  solde: 'Soldé',
  en_retard: 'En retard',
  annule: 'Annulé',
};

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Espèces',
  mpesa: 'M-Pesa',
  airtel_money: 'Airtel Money',
  orange_money: 'Orange Money',
  bank: 'Virement bancaire',
  other: 'Autre',
};

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: 'Super administrateur',
  admin: "Administrateur de l'église",
  treasurer: 'Trésorier',
  collector: 'Percepteur',
  neighborhood_manager: 'Responsable de quartier',
  auditor: 'Auditeur',
  member: 'Membre',
};
