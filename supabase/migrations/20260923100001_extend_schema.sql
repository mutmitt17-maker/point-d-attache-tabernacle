-- EgliseCollecte: migration d'extension. Corrige create_payment (invalide en 20260923100000)
-- et ajoute les modules manquants : recouvrement, caisse/remise, pièces jointes, notifications,
-- paramètres, audit automatique, vérification publique de reçu, Storage sécurisé.
set search_path=church,public;

-- ============================================================================
-- 1. Types et tables manquants
-- ============================================================================
create type church.visit_status as enum ('a_faire','visite','absent','promesse','paye_partiel','refus','a_reprogrammer');
create type church.handover_state as enum ('submitted','validated','rejected');

create table church.settings(
  church_id uuid primary key references church.churches(id) on delete cascade,
  require_payment_validation boolean not null default false,
  allow_overpayment_default boolean not null default false,
  gps_enabled boolean not null default false,
  updated_by uuid references church.profiles(id),
  updated_at timestamptz not null default now()
);

create table church.collector_assignments(
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references church.churches(id),
  collector_id uuid not null references church.profiles(id),
  neighborhood_id uuid references church.neighborhoods(id),
  campaign_id uuid references church.campaigns(id),
  assigned_by uuid references church.profiles(id),
  assigned_at timestamptz not null default now(),
  active boolean not null default true
);

create table church.collection_visits(
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references church.churches(id),
  member_id uuid not null references church.members(id),
  campaign_id uuid references church.campaigns(id),
  collector_id uuid references church.profiles(id),
  planned_on date,
  status church.visit_status not null default 'a_faire',
  notes text,
  created_by uuid references church.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table church.cash_handover(
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references church.churches(id),
  cash_session_id uuid not null references church.cash_sessions(id),
  collector_id uuid not null references church.profiles(id),
  amount numeric(14,2) not null check(amount>=0),
  state church.handover_state not null default 'submitted',
  submitted_at timestamptz not null default now(),
  validated_by uuid references church.profiles(id),
  validated_at timestamptz,
  rejection_reason text,
  slip_no text unique
);

create table church.attachments(
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references church.churches(id),
  entity text not null,
  entity_id uuid not null,
  kind text not null check(kind in ('signature_member','signature_collector','payment_proof','member_photo','report')),
  storage_path text not null,
  uploaded_by uuid references church.profiles(id),
  created_at timestamptz not null default now()
);

create table church.notifications(
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references church.churches(id),
  member_id uuid references church.members(id),
  channel text not null check(channel in ('sms','whatsapp','email')),
  purpose text not null check(purpose in ('reminder','receipt','other')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check(status in ('queued','sent','failed')),
  created_by uuid references church.profiles(id),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

alter table church.payments add column if not exists verification_token uuid not null default gen_random_uuid();
alter table church.payments add column if not exists offline_recorded_at timestamptz;
create unique index if not exists payments_verification_idx on church.payments(verification_token);
alter table church.pledges add column if not exists cancel_reason text;
alter table church.pledges add column if not exists cancelled_by uuid references church.profiles(id);
alter table church.pledges add column if not exists cancelled_at timestamptz;

-- ============================================================================
-- 2. Journal d'audit automatique sur les tables sensibles (hors paiements,
--    déjà tracés explicitement dans les RPC financiers)
-- ============================================================================
create or replace function church.audit_row_change() returns trigger
language plpgsql security definer set search_path=church,public as $$
declare v_church uuid;
begin
  v_church := coalesce(new.church_id, old.church_id);
  insert into church.audit_logs(church_id,actor_id,action,entity,entity_id,old_data,new_data)
  values(v_church, auth.uid(), tg_op, tg_table_name,
         coalesce(new.id, old.id),
         case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
         case when tg_op in ('UPDATE','INSERT') then to_jsonb(new) else null end);
  return coalesce(new, old);
end $$;

create trigger members_audit after insert or update on church.members for each row execute function church.audit_row_change();
create trigger campaigns_audit after insert or update on church.campaigns for each row execute function church.audit_row_change();
create trigger pledges_audit after insert or update on church.pledges for each row execute function church.audit_row_change();
create trigger profiles_audit after insert or update on church.profiles for each row execute function church.audit_row_change();

-- ============================================================================
-- 3. Corrige refresh_pledge : gère le statut "annulé" et "en retard"
-- ============================================================================
create or replace function church.refresh_pledge(p_id uuid) returns void
language plpgsql security definer set search_path=church,public as $$
declare v_paid numeric(14,2); v_amount numeric(14,2); v_due date; v_status text; v_current text;
begin
  select amount,due_on,status into v_amount,v_due,v_current from church.pledges where id=p_id;
  if v_current='annule' then return; end if;
  select coalesce(sum(amount) filter(where state='validated'),0) into v_paid from church.payments where pledge_id=p_id;
  v_status := case
    when v_paid=0 then 'non_commence'
    when v_paid>=v_amount then 'solde'
    when v_paid=v_amount/2 then 'a_moitie'
    when v_paid<v_amount/2 then 'paiement_faible'
    else 'paiement_avance' end;
  if v_paid<v_amount and v_due is not null and v_due<current_date then v_status:='en_retard'; end if;
  update church.pledges set paid_amount=v_paid, balance=greatest(v_amount-v_paid,0), status=v_status where id=p_id;
end $$;

-- ============================================================================
-- 4. create_payment corrigé (la version initiale contenait des erreurs de
--    syntaxe PL/pgSQL empêchant le déploiement) + validation automatique,
--    jeton de vérification et journal d'audit.
-- ============================================================================
-- La version initiale (7 arguments) est remplacée par la version complète ci-dessous
-- (signatures, preuve, validation configurable) : signatures différentes, donc
-- "create or replace" ne suffit pas à la supprimer, on la retire explicitement.
drop function if exists church.create_payment(uuid,uuid,numeric,text,text,text,text);

create or replace function church.create_payment(
  p_pledge uuid, p_client_id uuid, p_amount numeric, p_currency text, p_method text,
  p_ref text default null, p_note text default null, p_member_sig text default null,
  p_collector_sig text default null, p_proof text default null, p_offline_at timestamptz default null
) returns uuid
language plpgsql security definer set search_path=church,public as $$
declare v_id uuid; v_church uuid; v_no text; v_balance numeric(14,2); v_allow_over boolean;
        v_role church.app_role; v_session uuid; v_requires_validation boolean; v_state church.payment_state;
begin
  if not church.is_staff() then raise exception 'unauthorized'; end if;
  if p_amount<=0 then raise exception 'amount must be positive'; end if;

  select id into v_id from church.payments where client_id=p_client_id;
  if v_id is not null then return v_id; end if; -- idempotence hors-ligne

  select p.church_id,p.balance,c.allow_overpayment into v_church,v_balance,v_allow_over
    from church.pledges p join church.campaigns c on c.id=p.campaign_id
    where p.id=p_pledge and c.state='active';
  if v_church is null then raise exception 'pledge not found or campaign inactive'; end if;
  if p_amount>v_balance and not coalesce(v_allow_over,false) then raise exception 'overpayment not allowed'; end if;

  select role into v_role from church.profiles where id=auth.uid();
  v_session := null;
  if v_role='collector' then
    select id into v_session from church.cash_sessions where collector_id=auth.uid() and state='open' order by opened_at desc limit 1;
    if v_session is null then raise exception 'open a cash session first'; end if;
  end if;

  select coalesce(require_payment_validation,false) into v_requires_validation from church.settings where church_id=v_church;
  v_state := case when coalesce(v_requires_validation,false) then 'pending' else 'validated' end;

  v_no := 'RCT-'||to_char(now(),'YYYY')||'-'||lpad(nextval('church.receipt_seq')::text,8,'0');

  insert into church.payments(
    church_id,pledge_id,collector_id,cash_session_id,client_id,amount,currency,method,transaction_ref,note,
    member_signature_path,collector_signature_path,proof_path,receipt_no,state,
    validated_at,validated_by,offline_recorded_at
  ) values(
    v_church,p_pledge,auth.uid(),v_session,p_client_id,p_amount,p_currency,p_method,p_ref,p_note,
    p_member_sig,p_collector_sig,p_proof,v_no,v_state,
    case when v_state='validated' then now() end, case when v_state='validated' then auth.uid() end, p_offline_at
  ) returning id into v_id;

  insert into church.audit_logs(church_id,actor_id,action,entity,entity_id,new_data)
    values(v_church,auth.uid(),'CREATE_PAYMENT','payments',v_id,
           jsonb_build_object('amount',p_amount,'receipt',v_no,'pledge',p_pledge,'state',v_state));
  return v_id;
end $$;

create or replace function church.validate_payment(p_payment uuid) returns void
language plpgsql security definer set search_path=church,public as $$
declare v_church uuid;
begin
  if not church.is_finance_admin() then raise exception 'unauthorized'; end if;
  update church.payments set state='validated', validated_at=now(), validated_by=auth.uid()
    where id=p_payment and state='pending' returning church_id into v_church;
  if v_church is null then raise exception 'payment not pending'; end if;
  insert into church.audit_logs(church_id,actor_id,action,entity,entity_id) values(v_church,auth.uid(),'VALIDATE_PAYMENT','payments',p_payment);
end $$;

create or replace function church.request_void_payment(p_payment uuid, p_reason text) returns void
language plpgsql security definer set search_path=church,public as $$
declare v_church uuid; v_collector uuid;
begin
  if not church.is_staff() then raise exception 'unauthorized'; end if;
  if p_reason is null or length(trim(p_reason))=0 then raise exception 'reason required'; end if;
  select church_id,collector_id into v_church,v_collector from church.payments where id=p_payment;
  if v_church is null then raise exception 'payment not found'; end if;
  if not church.is_finance_admin() and v_collector<>auth.uid() then raise exception 'unauthorized'; end if;
  update church.payments set state='void_requested', void_reason=p_reason where id=p_payment;
  insert into church.audit_logs(church_id,actor_id,action,entity,entity_id,new_data)
    values(v_church,auth.uid(),'REQUEST_VOID_PAYMENT','payments',p_payment,jsonb_build_object('reason',p_reason));
end $$;

create or replace function church.approve_void_payment(p_payment uuid, p_approve boolean) returns void
language plpgsql security definer set search_path=church,public as $$
declare v_church uuid; v_pledge uuid;
begin
  if not church.is_finance_admin() then raise exception 'unauthorized'; end if;
  select church_id,pledge_id into v_church,v_pledge from church.payments where id=p_payment and state='void_requested';
  if v_church is null then raise exception 'no pending void request'; end if;
  if p_approve then
    update church.payments set state='voided', voided_at=now(), voided_by=auth.uid() where id=p_payment;
    perform church.refresh_pledge(v_pledge);
    insert into church.audit_logs(church_id,actor_id,action,entity,entity_id) values(v_church,auth.uid(),'APPROVE_VOID_PAYMENT','payments',p_payment);
  else
    update church.payments set state='validated' where id=p_payment;
    insert into church.audit_logs(church_id,actor_id,action,entity,entity_id) values(v_church,auth.uid(),'REJECT_VOID_PAYMENT','payments',p_payment);
  end if;
end $$;

-- ============================================================================
-- 5. Caisse : ouverture, clôture, remise au trésorier
-- ============================================================================
create or replace function church.open_cash_session() returns uuid
language plpgsql security definer set search_path=church,public as $$
declare v_id uuid; v_church uuid;
begin
  if not church.is_staff() then raise exception 'unauthorized'; end if;
  if exists(select 1 from church.cash_sessions where collector_id=auth.uid() and state='open') then
    raise exception 'a cash session is already open';
  end if;
  select church_id into v_church from church.profiles where id=auth.uid();
  insert into church.cash_sessions(church_id,collector_id) values(v_church,auth.uid()) returning id into v_id;
  insert into church.audit_logs(church_id,actor_id,action,entity,entity_id) values(v_church,auth.uid(),'OPEN_CASH_SESSION','cash_sessions',v_id);
  return v_id;
end $$;

create or replace function church.close_cash_session(p_session uuid, p_declared numeric, p_variance_note text default null) returns void
language plpgsql security definer set search_path=church,public as $$
declare v_church uuid; v_owner uuid; v_theoretical numeric(14,2);
begin
  select church_id,collector_id into v_church,v_owner from church.cash_sessions where id=p_session;
  if v_owner<>auth.uid() and not church.is_finance_admin() then raise exception 'unauthorized'; end if;
  select coalesce(sum(amount),0) into v_theoretical from church.payments
    where cash_session_id=p_session and state='validated' and method='cash';
  if abs(p_declared - v_theoretical) > 0.01 and (p_variance_note is null or length(trim(p_variance_note))=0) then
    raise exception 'variance_note required when declared cash differs from theoretical amount';
  end if;
  update church.cash_sessions set state='closed', closed_at=now(), declared_cash=p_declared, variance_note=p_variance_note where id=p_session;
  insert into church.audit_logs(church_id,actor_id,action,entity,entity_id,new_data)
    values(v_church,auth.uid(),'CLOSE_CASH_SESSION','cash_sessions',p_session,
           jsonb_build_object('declared',p_declared,'theoretical',v_theoretical));
end $$;

create or replace function church.record_cash_handover(p_session uuid, p_amount numeric) returns uuid
language plpgsql security definer set search_path=church,public as $$
declare v_id uuid; v_church uuid; v_owner uuid; v_no text;
begin
  select church_id,collector_id into v_church,v_owner from church.cash_sessions where id=p_session and state='closed';
  if v_church is null then raise exception 'session must be closed first'; end if;
  if v_owner<>auth.uid() then raise exception 'unauthorized'; end if;
  v_no := 'BDX-'||to_char(now(),'YYYYMMDD')||'-'||lpad(nextval('church.handover_seq')::text,6,'0');
  insert into church.cash_handover(church_id,cash_session_id,collector_id,amount,slip_no)
    values(v_church,p_session,auth.uid(),p_amount,v_no) returning id into v_id;
  insert into church.audit_logs(church_id,actor_id,action,entity,entity_id,new_data)
    values(v_church,auth.uid(),'CASH_HANDOVER','cash_handover',v_id,jsonb_build_object('amount',p_amount,'slip',v_no));
  return v_id;
end $$;
create sequence if not exists church.handover_seq;

create or replace function church.validate_cash_handover(p_handover uuid, p_approve boolean, p_rejection_reason text default null) returns void
language plpgsql security definer set search_path=church,public as $$
declare v_church uuid;
begin
  if not church.is_finance_admin() then raise exception 'unauthorized'; end if;
  select church_id into v_church from church.cash_handover where id=p_handover and state='submitted';
  if v_church is null then raise exception 'handover not pending'; end if;
  update church.cash_handover set
    state=case when p_approve then 'validated' else 'rejected' end,
    validated_by=auth.uid(), validated_at=now(), rejection_reason=case when not p_approve then p_rejection_reason end
    where id=p_handover;
  insert into church.audit_logs(church_id,actor_id,action,entity,entity_id) values(v_church,auth.uid(),'VALIDATE_CASH_HANDOVER','cash_handover',p_handover);
end $$;

-- ============================================================================
-- 6. Souscriptions : création/annulation encadrées + membres
-- ============================================================================
create or replace function church.cancel_pledge(p_pledge uuid, p_reason text) returns void
language plpgsql security definer set search_path=church,public as $$
declare v_church uuid;
begin
  if not church.is_finance_admin() then raise exception 'unauthorized'; end if;
  if p_reason is null or length(trim(p_reason))=0 then raise exception 'reason required'; end if;
  update church.pledges set status='annule', cancel_reason=p_reason, cancelled_by=auth.uid(), cancelled_at=now()
    where id=p_pledge returning church_id into v_church;
  if v_church is null then raise exception 'pledge not found'; end if;
  insert into church.audit_logs(church_id,actor_id,action,entity,entity_id,new_data)
    values(v_church,auth.uid(),'CANCEL_PLEDGE','pledges',p_pledge,jsonb_build_object('reason',p_reason));
end $$;

create or replace function church.archive_member(p_member uuid) returns void
language plpgsql security definer set search_path=church,public as $$
declare v_church uuid;
begin
  if not church.is_finance_admin() then raise exception 'unauthorized'; end if;
  update church.members set status='archived', updated_at=now() where id=p_member returning church_id into v_church;
  if v_church is null then raise exception 'member not found'; end if;
  insert into church.audit_logs(church_id,actor_id,action,entity,entity_id) values(v_church,auth.uid(),'ARCHIVE_MEMBER','members',p_member);
end $$;

-- ============================================================================
-- 7. Vérification publique de reçu par QR code (aucune donnée sensible exposée)
-- ============================================================================
create or replace function church.verify_receipt(p_token uuid) returns table(
  receipt_no text, amount numeric, currency text, occurred_at timestamptz, church_name text, state church.payment_state
) language sql stable security definer set search_path=church,public as $$
  select p.receipt_no, p.amount, p.currency, p.occurred_at, c.name, p.state
  from church.payments p join church.churches c on c.id=p.church_id
  where p.verification_token=p_token
$$;

-- ============================================================================
-- 8. RLS : écriture directe encadrée pour les tables non financières
-- ============================================================================
alter table church.collector_assignments enable row level security;
alter table church.collection_visits enable row level security;
alter table church.cash_handover enable row level security;
alter table church.attachments enable row level security;
alter table church.notifications enable row level security;
alter table church.settings enable row level security;

-- Membres : lecture déjà couverte, écriture réservée aux administrateurs
create policy "admin write members" on church.members for insert with check(church.is_finance_admin() or (select role from church.profiles where id=auth.uid())='admin');
create policy "admin update members" on church.members for update using(church.is_finance_admin() or (select role from church.profiles where id=auth.uid())='admin');

create policy "admin write neighborhoods" on church.neighborhoods for insert with check(church.is_finance_admin() or (select role from church.profiles where id=auth.uid())='admin');
create policy "admin update neighborhoods" on church.neighborhoods for update using(church.is_finance_admin() or (select role from church.profiles where id=auth.uid())='admin');
create policy "admin write groups" on church.church_groups for insert with check(church.is_finance_admin() or (select role from church.profiles where id=auth.uid())='admin');
create policy "admin update groups" on church.church_groups for update using(church.is_finance_admin() or (select role from church.profiles where id=auth.uid())='admin');

create policy "admin write campaigns" on church.campaigns for insert with check(church.is_finance_admin() or (select role from church.profiles where id=auth.uid())='admin');
create policy "admin update campaigns" on church.campaigns for update using(church.is_finance_admin() or (select role from church.profiles where id=auth.uid())='admin');

create policy "staff write pledges" on church.pledges for insert with check(church.is_finance_admin() or (select role from church.profiles where id=auth.uid()) in ('admin'));
create policy "staff update pledges" on church.pledges for update using(church.is_finance_admin() or (select role from church.profiles where id=auth.uid())='admin');

create policy "super admin manage profiles" on church.profiles for insert with check((select role from church.profiles where id=auth.uid())='super_admin');
create policy "super admin update profiles" on church.profiles for update using((select role from church.profiles where id=auth.uid())='super_admin' or id=auth.uid())
  with check((select role from church.profiles where id=auth.uid())='super_admin' or id=auth.uid());

create policy "admin manage assignments" on church.collector_assignments for all using(church.is_finance_admin()) with check(church.is_finance_admin());
create policy "collector read own assignments" on church.collector_assignments for select using(collector_id=auth.uid() or church.is_finance_admin());

create policy "staff manage visits" on church.collection_visits for select using(church.is_staff());
create policy "admin write visits" on church.collection_visits for insert with check(church.is_finance_admin() or (select role from church.profiles where id=auth.uid())='admin');
create policy "assigned collector update visits" on church.collection_visits for update using(collector_id=auth.uid() or church.is_finance_admin());

create policy "handover visibility" on church.cash_handover for select using(church.is_finance_admin() or collector_id=auth.uid());

create policy "attachments visibility" on church.attachments for select using(church.is_finance_admin() or uploaded_by=auth.uid());
create policy "staff upload attachment record" on church.attachments for insert with check(church.is_staff() and uploaded_by=auth.uid());

create policy "staff read notifications" on church.notifications for select using(church.is_finance_admin());

create policy "staff read settings" on church.settings for select using(church.is_staff());
create policy "admin write settings" on church.settings for insert with check(church.is_finance_admin());
create policy "admin update settings" on church.settings for update using(church.is_finance_admin());

grant select on church.collector_assignments,church.collection_visits,church.cash_handover,church.attachments,church.notifications,church.settings to authenticated;
grant insert on church.members,church.neighborhoods,church.church_groups,church.campaigns,church.pledges,church.profiles,church.collector_assignments,church.collection_visits,church.attachments,church.settings to authenticated;
grant update on church.members,church.neighborhoods,church.church_groups,church.campaigns,church.pledges,church.profiles,church.collector_assignments,church.collection_visits,church.settings to authenticated;
grant execute on function
  church.validate_payment(uuid), church.request_void_payment(uuid,text), church.approve_void_payment(uuid,boolean),
  church.open_cash_session(), church.close_cash_session(uuid,numeric,text),
  church.record_cash_handover(uuid,numeric), church.validate_cash_handover(uuid,boolean,text),
  church.cancel_pledge(uuid,text), church.archive_member(uuid)
  to authenticated;
grant execute on function church.create_payment(uuid,uuid,numeric,text,text,text,text,text,text,text,timestamptz) to authenticated;
grant execute on function church.verify_receipt(uuid) to anon, authenticated;

create index if not exists visits_member_idx on church.collection_visits(member_id,status);
create index if not exists visits_collector_idx on church.collection_visits(collector_id,planned_on);
create index if not exists members_neighborhood_idx on church.members(neighborhood_id,status);
create index if not exists payments_state_idx on church.payments(state,method);

-- ============================================================================
-- 9. Storage : buckets privés + politiques par rôle
-- ============================================================================
insert into storage.buckets(id,name,public) values
  ('signatures','signatures',false),
  ('payment-proofs','payment-proofs',false),
  ('member-photos','member-photos',false),
  ('reports','reports',false)
on conflict (id) do nothing;

create policy "staff read signatures" on storage.objects for select using(bucket_id='signatures' and church.is_staff());
create policy "staff upload signatures" on storage.objects for insert with check(bucket_id='signatures' and church.is_staff() and (storage.foldername(name))[1]=auth.uid()::text);
create policy "staff read proofs" on storage.objects for select using(bucket_id='payment-proofs' and church.is_staff());
create policy "staff upload proofs" on storage.objects for insert with check(bucket_id='payment-proofs' and church.is_staff() and (storage.foldername(name))[1]=auth.uid()::text);
create policy "staff read photos" on storage.objects for select using(bucket_id='member-photos' and church.is_staff());
create policy "admin upload photos" on storage.objects for insert with check(bucket_id='member-photos' and church.is_finance_admin());
create policy "finance read reports" on storage.objects for select using(bucket_id='reports' and church.is_finance_admin());
create policy "finance upload reports" on storage.objects for insert with check(bucket_id='reports' and church.is_finance_admin());
