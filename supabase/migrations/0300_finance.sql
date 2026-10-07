-- =====================================================================
-- 0300_finance.sql
-- Lextria Finance Schema & App Tables
-- Dedicated schema: finance
-- Shared Supabase project: interacts with schema core
-- =====================================================================

create schema if not exists finance;

-- ---------------------------------------------------------------------
-- 1. Service Catalog & Stage Templates
-- ---------------------------------------------------------------------
create table if not exists finance.service_catalog (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  default_fee  numeric(12,2) not null default 0.00,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  created_by   uuid references core.profiles(id)
);

create table if not exists finance.stage_templates (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  items        jsonb not null default '[]'::jsonb, -- array of {stage_key, name, percent, trigger_event_code, manual}
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  created_by   uuid references core.profiles(id)
);

create table if not exists finance.client_rate_cards (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references core.clients(id) on delete cascade,
  service_id   uuid not null references finance.service_catalog(id) on delete cascade,
  fee          numeric(12,2) not null check (fee >= 0),
  valid_from   date not null default current_date,
  created_at   timestamptz not null default now(),
  created_by   uuid references core.profiles(id),
  unique(client_id, service_id, valid_from)
);

-- ---------------------------------------------------------------------
-- 2. Quotations & Billing Stages
-- ---------------------------------------------------------------------
create table if not exists finance.quotations (
  id                   uuid primary key default gen_random_uuid(),
  project_code_id      uuid not null references core.project_codes(id),
  client_id            uuid not null references core.clients(id),
  quote_number         text not null,
  version              integer not null default 1,
  status               text not null check (status in
                         ('DRAFT','SENT','CONFIRMED','REJECTED','SUPERSEDED','CANCELLED'))
                         default 'DRAFT',
  total_prof_fee       numeric(12,2) not null default 0.00 check (total_prof_fee >= 0),
  est_govt_fee         numeric(12,2) not null default 0.00 check (est_govt_fee >= 0),
  gst_applicable       boolean not null default true,
  confirmed_via        text check (confirmed_via in ('ESIGN','OVERRIDE')),
  override_reason      text,
  override_document_id uuid references core.documents(id),
  amendment_reason     text,
  supersedes_id        uuid references finance.quotations(id),
  notes                text,
  confirmed_at         timestamptz,
  created_at           timestamptz not null default now(),
  created_by           uuid references core.profiles(id)
);

create table if not exists finance.billing_stages (
  id                 uuid primary key default gen_random_uuid(),
  quotation_id       uuid not null references finance.quotations(id) on delete cascade,
  project_code_id    uuid not null references core.project_codes(id),
  stage_key          text not null,
  name               text not null,
  allocated_amount   numeric(12,2) not null default 0.00 check (allocated_amount >= 0),
  trigger_event_code text references core.event_codes(code),
  manual_completion  boolean not null default false,
  is_completed       boolean not null default false,
  completed_at       timestamptz,
  completed_note     text,
  billing_status     text not null check (billing_status in
                       ('PENDING','UNBILLED_WORK_DONE','INVOICED','PAID'))
                       default 'PENDING',
  invoice_ref_id     uuid, -- forward reference; foreign key added after invoice_refs created
  created_at         timestamptz not null default now(),
  created_by         uuid references core.profiles(id)
);

-- ---------------------------------------------------------------------
-- 3. Event Cursor for Auto Stage Completion
-- ---------------------------------------------------------------------
create table if not exists finance.event_cursor (
  id              uuid primary key default gen_random_uuid(),
  last_created_at timestamptz not null default '1970-01-01 00:00:00+00'::timestamptz,
  last_event_id   uuid references core.matter_events(id),
  updated_at      timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  created_by      uuid references core.profiles(id)
);

-- ---------------------------------------------------------------------
-- 4. Invoices (Zoho Books Refs) & Links
-- ---------------------------------------------------------------------
create table if not exists finance.invoice_refs (
  id                   uuid primary key default gen_random_uuid(),
  zoho_books_invoice_no text not null unique,
  invoice_date         date not null,
  client_id            uuid not null references core.clients(id),
  professional_taxable numeric(12,2) not null default 0.00,
  gst_amount           numeric(12,2) not null default 0.00,
  reimbursement_amount numeric(12,2) not null default 0.00,
  total_amount         numeric(12,2) not null default 0.00,
  notes                text,
  created_at           timestamptz not null default now(),
  created_by           uuid references core.profiles(id)
);

-- Link billing_stages.invoice_ref_id foreign key
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_billing_stages_invoice_ref'
      and conrelid = 'finance.billing_stages'::regclass
  ) then
    alter table finance.billing_stages
      add constraint fk_billing_stages_invoice_ref
      foreign key (invoice_ref_id) references finance.invoice_refs(id) on delete set null;
  end if;
end $$;

create table if not exists finance.invoice_ref_stages (
  id               uuid primary key default gen_random_uuid(),
  invoice_ref_id   uuid not null references finance.invoice_refs(id) on delete cascade,
  billing_stage_id uuid not null references finance.billing_stages(id) on delete cascade,
  created_at       timestamptz not null default now(),
  created_by       uuid references core.profiles(id),
  unique(invoice_ref_id, billing_stage_id)
);

create table if not exists finance.invoice_ref_costs (
  id                  uuid primary key default gen_random_uuid(),
  invoice_ref_id      uuid not null references finance.invoice_refs(id) on delete cascade,
  recoverable_cost_id uuid not null references core.recoverable_costs(id),
  created_at          timestamptz not null default now(),
  created_by          uuid references core.profiles(id),
  unique(invoice_ref_id, recoverable_cost_id)
);

-- ---------------------------------------------------------------------
-- 5. Payments, Allocations, Advances, Credit Notes & Write-offs
-- ---------------------------------------------------------------------
create table if not exists finance.payments (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references core.clients(id),
  received_date date not null,
  gross_amount  numeric(12,2) not null check (gross_amount > 0),
  tds_amount    numeric(12,2) not null default 0.00 check (tds_amount >= 0),
  net_amount    numeric(12,2) not null check (net_amount >= 0),
  mode          text not null check (mode in
                  ('NEFT','RTGS','IMPS','UPI','CHEQUE','CASH','OTHER')),
  reference     text,
  notes         text,
  created_at    timestamptz not null default now(),
  created_by    uuid references core.profiles(id)
);

create table if not exists finance.payment_allocations (
  id                  uuid primary key default gen_random_uuid(),
  payment_id          uuid not null references finance.payments(id) on delete cascade,
  invoice_ref_id      uuid references finance.invoice_refs(id),
  recoverable_cost_id uuid references core.recoverable_costs(id),
  amount              numeric(12,2) not null check (amount > 0),
  created_at          timestamptz not null default now(),
  created_by          uuid references core.profiles(id)
);

create table if not exists finance.advances (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references core.clients(id),
  received_date    date not null,
  amount           numeric(12,2) not null check (amount > 0),
  reference        text,
  allocated_amount numeric(12,2) not null default 0.00 check (allocated_amount >= 0),
  notes            text,
  created_at       timestamptz not null default now(),
  created_by       uuid references core.profiles(id)
);

create table if not exists finance.credit_notes (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references core.clients(id),
  invoice_ref_id uuid not null references finance.invoice_refs(id),
  amount         numeric(12,2) not null check (amount > 0),
  reason         text not null,
  approved_by    uuid references core.profiles(id),
  created_at     timestamptz not null default now(),
  created_by     uuid references core.profiles(id)
);

create table if not exists finance.write_offs (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references core.clients(id),
  invoice_ref_id uuid not null references finance.invoice_refs(id),
  amount         numeric(12,2) not null check (amount > 0),
  reason         text not null,
  approved_by    uuid references core.profiles(id),
  created_at     timestamptz not null default now(),
  created_by     uuid references core.profiles(id)
);

-- ---------------------------------------------------------------------
-- 6. Posting Rules & E-Sign
-- ---------------------------------------------------------------------
create table if not exists finance.posting_rules (
  id          uuid primary key default gen_random_uuid(),
  category    text not null unique,
  recoverable boolean not null default true,
  auto_post   boolean not null default false,
  created_at  timestamptz not null default now(),
  created_by  uuid references core.profiles(id)
);

create table if not exists finance.esign_requests (
  id                    uuid primary key default gen_random_uuid(),
  document_type         text not null check (document_type in
                          ('QUOTATION','ENGAGEMENT_LETTER','MOU','FEE_AGREEMENT')),
  project_code_id       uuid not null references core.project_codes(id),
  client_id             uuid not null references core.clients(id),
  quotation_id          uuid references finance.quotations(id),
  leegality_document_id text,
  sent_at               timestamptz,
  sent_by               uuid references core.profiles(id),
  status                text not null check (status in
                          ('DRAFT','SENT','PARTIALLY_SIGNED','SIGNED','DECLINED','EXPIRED','CANCELLED'))
                          default 'DRAFT',
  completed_at          timestamptz,
  signed_document_id    uuid references core.documents(id),
  created_at            timestamptz not null default now(),
  created_by            uuid references core.profiles(id)
);

create table if not exists finance.esign_signers (
  id               uuid primary key default gen_random_uuid(),
  esign_request_id uuid not null references finance.esign_requests(id) on delete cascade,
  name             text not null,
  email            text not null,
  signing_order    integer not null default 1,
  status           text not null check (status in ('PENDING','SENT','VIEWED','SIGNED','REJECTED'))
                     default 'PENDING',
  signed_at        timestamptz,
  created_at       timestamptz not null default now(),
  created_by       uuid references core.profiles(id)
);

-- ---------------------------------------------------------------------
-- 7. Fee Schedule & Govt Fee Requests & Portal Payments
-- ---------------------------------------------------------------------
create table if not exists finance.fee_schedule (
  id                     uuid primary key default gen_random_uuid(),
  office                 text not null,
  form_or_action         text not null,
  applicant_fee_category text not null,
  efiling_amount         numeric(12,2) not null default 0.00,
  effective_from         date not null default current_date,
  created_at             timestamptz not null default now(),
  created_by             uuid references core.profiles(id)
);

create table if not exists finance.govt_fee_requests (
  id                     uuid primary key default gen_random_uuid(),
  project_code_id        uuid not null references core.project_codes(id),
  form                   text not null,
  applicant_fee_category text not null,
  amount                 numeric(12,2) not null check (amount > 0),
  adjustment_reason      text,
  requested_by           uuid not null references core.profiles(id),
  status                 text not null check (status in
                           ('REQUESTED','APPROVED','REJECTED','PAID','RECONCILED','REFUND_PENDING','REFUNDED'))
                           default 'REQUESTED',
  approved_by            uuid references core.profiles(id),
  approved_at            timestamptz,
  paid_by                uuid references core.profiles(id),
  paid_at                timestamptz,
  transaction_reference  text,
  recoverable            boolean not null default true,
  recoverable_cost_id    uuid references core.recoverable_costs(id),
  created_at             timestamptz not null default now(),
  created_by             uuid references core.profiles(id)
);

create table if not exists finance.portal_payment_records (
  id                 uuid primary key default gen_random_uuid(),
  payment_date       date not null,
  office             text not null,
  reference          text not null,
  amount             numeric(12,2) not null check (amount > 0),
  identifier         text,
  entered_by         uuid not null references core.profiles(id),
  match_status       text not null check (match_status in ('UNMATCHED','MATCHED','RESOLVED'))
                       default 'UNMATCHED',
  matched_request_id uuid references finance.govt_fee_requests(id),
  resolution_note    text,
  created_at         timestamptz not null default now(),
  created_by         uuid references core.profiles(id)
);

-- ---------------------------------------------------------------------
-- 8. Reimbursements (Claims, Bills, Allocations, Payouts)
-- ---------------------------------------------------------------------
create table if not exists finance.reimbursement_payouts (
  id          uuid primary key default gen_random_uuid(),
  payout_date date not null default current_date,
  method      text not null check (method in ('BANK_TRANSFER','UPI')),
  reference   text,
  total       numeric(12,2) not null default 0.00 check (total >= 0),
  paid_by     uuid not null references core.profiles(id),
  created_at  timestamptz not null default now(),
  created_by  uuid references core.profiles(id)
);

create table if not exists finance.reimbursement_claims (
  id                   uuid primary key default gen_random_uuid(),
  claimant_id          uuid not null references core.profiles(id),
  expense_date         date not null,
  category             text not null check (category in
                         ('FUEL','PURCHASE','TRAVEL','FOOD','POSTAGE_COURIER','FEE_PAID_PERSONALLY','OTHER')),
  description          text not null,
  amount               numeric(12,2) not null check (amount > 0),
  paid_with            text not null check (paid_with in ('OWN_CASH','OWN_UPI','OWN_CARD')),
  bill_override_by     uuid references core.profiles(id),
  bill_override_reason text,
  status               text not null check (status in
                         ('SUBMITTED','MANAGER_APPROVED','FINANCE_APPROVED','PAID','QUERIED','REJECTED'))
                         default 'SUBMITTED',
  manager_id           uuid references core.profiles(id),
  manager_decision_by  uuid references core.profiles(id),
  manager_decision_at  timestamptz,
  finance_decision_by  uuid references core.profiles(id),
  finance_decision_at  timestamptz,
  query_note           text,
  payout_id            uuid references finance.reimbursement_payouts(id),
  created_at           timestamptz not null default now(),
  created_by           uuid references core.profiles(id)
);

create table if not exists finance.reimbursement_bills (
  id          uuid primary key default gen_random_uuid(),
  claim_id    uuid not null references finance.reimbursement_claims(id) on delete cascade,
  document_id uuid not null references core.documents(id),
  created_at  timestamptz not null default now(),
  created_by  uuid references core.profiles(id)
);

create table if not exists finance.reimbursement_allocations (
  id                  uuid primary key default gen_random_uuid(),
  claim_id            uuid not null references finance.reimbursement_claims(id) on delete cascade,
  project_code_id     uuid not null references core.project_codes(id),
  amount              numeric(12,2) not null check (amount > 0),
  recoverable_cost_id uuid references core.recoverable_costs(id),
  created_at          timestamptz not null default now(),
  created_by          uuid references core.profiles(id)
);

-- ---------------------------------------------------------------------
-- 9. Vendors & Miscellaneous Jobs
-- ---------------------------------------------------------------------
create table if not exists finance.vendors (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  contact_person text,
  phone          text,
  email          text,
  gstin          text,
  pan            text,
  services       text[] default '{}'::text[],
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  created_by     uuid references core.profiles(id)
);

create table if not exists finance.misc_jobs (
  id                    uuid primary key default gen_random_uuid(),
  project_code_id       uuid not null references core.project_codes(id),
  client_id             uuid not null references core.clients(id),
  work_type             text not null,
  description           text not null,
  vendor_id             uuid references finance.vendors(id),
  status                text not null check (status in
                          ('RECEIVED','SENT_TO_VENDOR','IN_PROGRESS','AWAITING_CLIENT_DOCS','COMPLETED','DELIVERED_TO_CLIENT','CANCELLED'))
                          default 'RECEIVED',
  client_due_date       date,
  statutory_due_date    date,
  amount_charged        numeric(12,2) not null default 0.00 check (amount_charged >= 0),
  vendor_cost           numeric(12,2) not null default 0.00 check (vendor_cost >= 0),
  zoho_books_invoice_no text,
  vendor_bill_no        text,
  vendor_bill_date      date,
  vendor_payment_status text not null check (vendor_payment_status in ('UNPAID','PAID'))
                          default 'UNPAID',
  vendor_paid_date      date,
  vendor_tds            numeric(12,2) not null default 0.00 check (vendor_tds >= 0),
  created_at            timestamptz not null default now(),
  created_by            uuid references core.profiles(id)
);

create table if not exists finance.cliq_outbox (
  id         uuid primary key default gen_random_uuid(),
  channel    text not null,
  title      text not null,
  link       text,
  card       jsonb,
  status     text not null default 'QUEUED',
  created_at timestamptz not null default now(),
  created_by uuid references core.profiles(id)
);

-- ---------------------------------------------------------------------
-- 10. Indexes for Fast Filtering & Dashboard Analytics
-- ---------------------------------------------------------------------
create index if not exists idx_quotations_client on finance.quotations (client_id, status);
create index if not exists idx_quotations_project on finance.quotations (project_code_id);
create index if not exists idx_billing_stages_quote on finance.billing_stages (quotation_id);
create index if not exists idx_billing_stages_project on finance.billing_stages (project_code_id);
create index if not exists idx_billing_stages_status on finance.billing_stages (billing_status, is_completed);
create index if not exists idx_billing_stages_trigger on finance.billing_stages (trigger_event_code);
create index if not exists idx_invoice_refs_client on finance.invoice_refs (client_id, invoice_date desc);
create index if not exists idx_payments_client on finance.payments (client_id, received_date desc);
create index if not exists idx_advances_client on finance.advances (client_id);
create index if not exists idx_govt_fee_status on finance.govt_fee_requests (status, project_code_id);
create index if not exists idx_portal_pay_ref on finance.portal_payment_records (reference, match_status);
create index if not exists idx_reimb_claimant on finance.reimbursement_claims (claimant_id, status);
create index if not exists idx_reimb_status on finance.reimbursement_claims (status);
create index if not exists idx_misc_jobs_status on finance.misc_jobs (status, statutory_due_date);

-- ---------------------------------------------------------------------
-- 11. Read Views (security_invoker = true)
-- Avoids cross-schema PostgREST join failures and powers screens directly
-- ---------------------------------------------------------------------

-- View: client_ledger
create or replace view finance.client_ledger with (security_invoker = true) as
with raw_lines as (
  -- 1. Invoices
  select
    i.id as id,
    i.client_id,
    i.invoice_date as line_date,
    'INVOICE' as entry_type,
    'Invoice #' || i.zoho_books_invoice_no || coalesce(' (' || i.notes || ')', '') as description,
    -- Debit excludes already AUTO_POSTED recoverable costs that were on this invoice
    (i.total_amount - coalesce((
      select sum(rc.amount)
      from finance.invoice_ref_costs irc
      join core.recoverable_costs rc on rc.id = irc.recoverable_cost_id
      where irc.invoice_ref_id = i.id and rc.posting_status = 'AUTO_POSTED'
    ), 0)) as debit,
    0::numeric(12,2) as credit,
    i.created_at
  from finance.invoice_refs i

  union all

  -- 2. Recoverable Costs (AUTO_POSTED only)
  select
    rc.id as id,
    rc.client_id,
    rc.cost_date as line_date,
    'RECOVERABLE_COST' as entry_type,
    'Disbursement: ' || rc.category || ' - ' || rc.description as description,
    rc.amount as debit,
    0::numeric(12,2) as credit,
    rc.created_at
  from core.recoverable_costs rc
  where rc.posting_status = 'AUTO_POSTED' and rc.client_id is not null

  union all

  -- 3. Payments
  select
    p.id as id,
    p.client_id,
    p.received_date as line_date,
    'PAYMENT' as entry_type,
    'Payment received (' || p.mode || coalesce(' Ref: ' || p.reference, '') || ')' as description,
    0::numeric(12,2) as debit,
    p.gross_amount as credit,
    p.created_at
  from finance.payments p

  union all

  -- 4. Credit Notes
  select
    cn.id as id,
    cn.client_id,
    cn.created_at::date as line_date,
    'CREDIT_NOTE' as entry_type,
    'Credit Note: ' || cn.reason as description,
    0::numeric(12,2) as debit,
    cn.amount as credit,
    cn.created_at
  from finance.credit_notes cn

  union all

  -- 5. Write Offs
  select
    wo.id as id,
    wo.client_id,
    wo.created_at::date as line_date,
    'WRITE_OFF' as entry_type,
    'Write Off: ' || wo.reason as description,
    0::numeric(12,2) as debit,
    wo.amount as credit,
    wo.created_at
  from finance.write_offs wo

  union all

  -- 6. Reversals of Recoverable Costs
  select
    rc.id as id,
    rc.client_id,
    rc.cost_date as line_date,
    'REVERSAL' as entry_type,
    'Reversal of Disbursement: ' || rc.description as description,
    0::numeric(12,2) as debit,
    rc.amount as credit,
    rc.created_at
  from core.recoverable_costs rc
  where rc.posting_status = 'REVERSED' and rc.client_id is not null
)
select
  l.id,
  l.client_id,
  l.line_date,
  l.entry_type,
  l.description,
  l.debit,
  l.credit,
  l.created_at,
  sum(l.debit - l.credit) over (
    partition by l.client_id
    order by l.line_date asc, l.created_at asc, l.id asc
    rows between unbounded preceding and current row
  ) as running_balance
from raw_lines l;

-- View: quotations_view
create or replace view finance.quotations_view with (security_invoker = true) as
select
  q.*,
  c.client_code,
  c.client_name,
  c.state_code as client_state_code,
  c.gstin as client_gstin,
  pc.code as project_code,
  pc.title as project_title,
  p.display_name as creator_name,
  (select count(*) from finance.billing_stages bs where bs.quotation_id = q.id) as stages_count,
  (select count(*) from finance.billing_stages bs where bs.quotation_id = q.id and bs.is_completed = true) as completed_stages_count
from finance.quotations q
join core.clients c on c.id = q.client_id
join core.project_codes pc on pc.id = q.project_code_id
left join core.profiles p on p.id = q.created_by;

-- View: billing_stages_view
create or replace view finance.billing_stages_view with (security_invoker = true) as
select
  bs.*,
  q.quote_number,
  q.version as quote_version,
  q.status as quote_status,
  c.id as client_id,
  c.client_code,
  c.client_name,
  c.state_code as client_state_code,
  pc.code as project_code,
  pc.title as project_title,
  ir.zoho_books_invoice_no
from finance.billing_stages bs
join finance.quotations q on q.id = bs.quotation_id
join core.project_codes pc on pc.id = bs.project_code_id
join core.clients c on c.id = q.client_id
left join finance.invoice_refs ir on ir.id = bs.invoice_ref_id;

-- View: invoices_view
create or replace view finance.invoices_view with (security_invoker = true) as
select
  i.*,
  c.client_code,
  c.client_name,
  c.state_code as client_state_code,
  c.gstin as client_gstin,
  (select count(*) from finance.invoice_ref_stages irs where irs.invoice_ref_id = i.id) as stages_count,
  (select count(*) from finance.invoice_ref_costs irc where irc.invoice_ref_id = i.id) as costs_count,
  coalesce((select sum(pa.amount) from finance.payment_allocations pa where pa.invoice_ref_id = i.id), 0.00) as paid_amount,
  (i.total_amount - coalesce((select sum(pa.amount) from finance.payment_allocations pa where pa.invoice_ref_id = i.id), 0.00)) as outstanding_amount
from finance.invoice_refs i
join core.clients c on c.id = i.client_id;

-- View: recoverable_costs_view
create or replace view finance.recoverable_costs_view with (security_invoker = true) as
select
  rc.*,
  c.client_code,
  c.client_name,
  pc.code as project_code,
  pc.title as project_title,
  d.file_name as evidence_file_name,
  d.zoho_permalink as evidence_permalink,
  p.display_name as creator_name,
  rp.display_name as reviewer_name
from core.recoverable_costs rc
left join core.clients c on c.id = rc.client_id
left join core.project_codes pc on pc.id = rc.project_code_id
left join core.documents d on d.id = rc.evidence_document_id
left join core.profiles p on p.id = rc.created_by
left join core.profiles rp on rp.id = rc.reviewed_by;

-- View: reimbursement_claims_view
create or replace view finance.reimbursement_claims_view with (security_invoker = true) as
select
  rc.*,
  cl.display_name as claimant_name,
  cl.email as claimant_email,
  cl.department as claimant_department,
  mgr.display_name as manager_name,
  fin.display_name as finance_decision_maker_name,
  ovr.display_name as override_approver_name,
  p.reference as payout_reference,
  p.payout_date,
  (select count(*) from finance.reimbursement_bills rb where rb.claim_id = rc.id) as bills_count,
  (select count(*) from finance.reimbursement_allocations ra where ra.claim_id = rc.id) as allocations_count
from finance.reimbursement_claims rc
join core.profiles cl on cl.id = rc.claimant_id
left join core.profiles mgr on mgr.id = rc.manager_id
left join core.profiles fin on fin.id = rc.finance_decision_by
left join core.profiles ovr on ovr.id = rc.bill_override_by
left join finance.reimbursement_payouts p on p.id = rc.payout_id;

-- View: govt_fee_requests_view
create or replace view finance.govt_fee_requests_view with (security_invoker = true) as
select
  gfr.*,
  pc.code as project_code,
  pc.title as project_title,
  c.id as client_id,
  c.client_code,
  c.client_name,
  req.display_name as requester_name,
  appr.display_name as approver_name,
  payer.display_name as payer_name
from finance.govt_fee_requests gfr
join core.project_codes pc on pc.id = gfr.project_code_id
join core.clients c on c.id = pc.client_id
left join core.profiles req on req.id = gfr.requested_by
left join core.profiles appr on appr.id = gfr.approved_by
left join core.profiles payer on payer.id = gfr.paid_by;

-- View: misc_jobs_view
create or replace view finance.misc_jobs_view with (security_invoker = true) as
select
  mj.*,
  pc.code as project_code,
  pc.title as project_title,
  c.client_code,
  c.client_name,
  v.name as vendor_name,
  v.gstin as vendor_gstin,
  (mj.amount_charged - mj.vendor_cost) as margin_amount,
  case when mj.amount_charged > 0
    then round(((mj.amount_charged - mj.vendor_cost) / mj.amount_charged) * 100, 2)
    else 0.00
  end as margin_percent
from finance.misc_jobs mj
join core.project_codes pc on pc.id = mj.project_code_id
join core.clients c on c.id = mj.client_id
left join finance.vendors v on v.id = mj.vendor_id;

-- ---------------------------------------------------------------------
-- 12. Stored Procedures & Atomic Functions (schema finance)
-- ---------------------------------------------------------------------

-- Function: create_quotation_with_stages
create or replace function finance.create_quotation_with_stages(
  p_project_code_id uuid,
  p_client_id       uuid,
  p_quote_number    text,
  p_total_prof_fee  numeric,
  p_est_govt_fee    numeric,
  p_gst_applicable  boolean,
  p_stages          jsonb, -- array of {stage_key, name, allocated_amount, trigger_event_code, manual_completion}
  p_notes           text default null,
  p_supersedes_id   uuid default null,
  p_amendment_reason text default null
) returns uuid
language plpgsql security invoker set search_path = finance, core as $$
declare
  v_quote_id uuid;
  v_stage jsonb;
  v_sum_stages numeric := 0;
  v_version int := 1;
begin
  if not core.has_role('FINANCE', 'SUPER_ADMIN') then
    raise exception 'Unauthorized: Only Finance or Super Admin can create quotations';
  end if;

  -- Validate sum of stages
  for v_stage in select * from jsonb_array_elements(p_stages) loop
    if (v_stage->>'allocated_amount') is null or (v_stage->>'allocated_amount')::numeric < 0 then
      raise exception 'Stage amount cannot be negative or null';
    end if;

    -- Validate trigger code OR manual completion
    if coalesce(v_stage->>'manual_completion', 'false')::boolean = false
       and (v_stage->>'trigger_event_code' is null or v_stage->>'trigger_event_code' = '') then
      raise exception 'Stage "%" must specify a trigger event code or be marked as manual completion', v_stage->>'name';
    end if;

    v_sum_stages := v_sum_stages + (v_stage->>'allocated_amount')::numeric;
  end loop;

  if abs(v_sum_stages - p_total_prof_fee) > 0.01 then
    raise exception 'Stage amounts sum (₹%) does not match total professional fee (₹%)', v_sum_stages, p_total_prof_fee;
  end if;

  -- Handle amendment/superseding
  if p_supersedes_id is not null then
    select coalesce(version, 1) + 1 into v_version from finance.quotations where id = p_supersedes_id;
    update finance.quotations set status = 'SUPERSEDED' where id = p_supersedes_id;
  end if;

  insert into finance.quotations(
    project_code_id, client_id, quote_number, version, status,
    total_prof_fee, est_govt_fee, gst_applicable, amendment_reason,
    supersedes_id, notes, created_by
  ) values (
    p_project_code_id, p_client_id, p_quote_number, v_version, 'DRAFT',
    p_total_prof_fee, p_est_govt_fee, p_gst_applicable, p_amendment_reason,
    p_supersedes_id, p_notes, auth.uid()
  ) returning id into v_quote_id;

  for v_stage in select * from jsonb_array_elements(p_stages) loop
    insert into finance.billing_stages(
      quotation_id, project_code_id, stage_key, name,
      allocated_amount, trigger_event_code, manual_completion,
      is_completed, billing_status, created_by
    ) values (
      v_quote_id, p_project_code_id, v_stage->>'stage_key', v_stage->>'name',
      (v_stage->>'allocated_amount')::numeric,
      nullif(v_stage->>'trigger_event_code', ''),
      coalesce((v_stage->>'manual_completion')::boolean, false),
      false, 'PENDING', auth.uid()
    );
  end loop;

  return v_quote_id;
end $$;

-- Function: record_invoice_with_stages_and_costs
create or replace function finance.record_invoice_with_stages_and_costs(
  p_zoho_books_invoice_no text,
  p_invoice_date          date,
  p_client_id             uuid,
  p_professional_taxable  numeric,
  p_gst_amount            numeric,
  p_reimbursement_amount  numeric,
  p_total_amount          numeric,
  p_notes                 text,
  p_stage_ids             uuid[],
  p_cost_ids              uuid[]
) returns uuid
language plpgsql security invoker set search_path = finance, core as $$
declare
  v_inv_id uuid;
  v_stage_id uuid;
  v_cost_id uuid;
begin
  if not core.has_role('FINANCE', 'SUPER_ADMIN') then
    raise exception 'Unauthorized: Only Finance or Super Admin can record invoices';
  end if;

  if p_zoho_books_invoice_no is null or trim(p_zoho_books_invoice_no) = '' then
    raise exception 'Zoho Books Invoice Number is mandatory';
  end if;

  insert into finance.invoice_refs(
    zoho_books_invoice_no, invoice_date, client_id,
    professional_taxable, gst_amount, reimbursement_amount,
    total_amount, notes, created_by
  ) values (
    trim(p_zoho_books_invoice_no), p_invoice_date, p_client_id,
    p_professional_taxable, p_gst_amount, p_reimbursement_amount,
    p_total_amount, p_notes, auth.uid()
  ) returning id into v_inv_id;

  -- Link stages
  if p_stage_ids is not null then
    foreach v_stage_id in array p_stage_ids loop
      insert into finance.invoice_ref_stages(invoice_ref_id, billing_stage_id, created_by)
      values (v_inv_id, v_stage_id, auth.uid());

      update finance.billing_stages
         set billing_status = 'INVOICED', invoice_ref_id = v_inv_id
       where id = v_stage_id;
    end loop;
  end if;

  -- Link recoverable costs
  if p_cost_ids is not null then
    foreach v_cost_id in array p_cost_ids loop
      insert into finance.invoice_ref_costs(invoice_ref_id, recoverable_cost_id, created_by)
      values (v_inv_id, v_cost_id, auth.uid());

      update core.recoverable_costs
         set recovered_via_invoice_ref_id = v_inv_id
       where id = v_cost_id;
    end loop;
  end if;

  return v_inv_id;
end $$;

-- Function: record_payment_with_allocations
create or replace function finance.record_payment_with_allocations(
  p_client_id     uuid,
  p_received_date date,
  p_gross_amount  numeric,
  p_tds_amount    numeric,
  p_net_amount    numeric,
  p_mode          text,
  p_reference     text,
  p_notes         text,
  p_allocations   jsonb -- array of {invoice_ref_id, recoverable_cost_id, amount}
) returns uuid
language plpgsql security invoker set search_path = finance, core as $$
declare
  v_payment_id uuid;
  v_alloc jsonb;
  v_alloc_inv_id uuid;
  v_inv_total numeric;
  v_inv_paid numeric;
begin
  if not core.has_role('FINANCE', 'SUPER_ADMIN') then
    raise exception 'Unauthorized: Only Finance or Super Admin can record payments';
  end if;

  insert into finance.payments(
    client_id, received_date, gross_amount, tds_amount, net_amount,
    mode, reference, notes, created_by
  ) values (
    p_client_id, p_received_date, p_gross_amount, p_tds_amount, p_net_amount,
    p_mode, p_reference, p_notes, auth.uid()
  ) returning id into v_payment_id;

  if p_allocations is not null then
    for v_alloc in select * from jsonb_array_elements(p_allocations) loop
      v_alloc_inv_id := nullif(v_alloc->>'invoice_ref_id', '')::uuid;

      insert into finance.payment_allocations(
        payment_id, invoice_ref_id, recoverable_cost_id, amount, created_by
      ) values (
        v_payment_id,
        v_alloc_inv_id,
        nullif(v_alloc->>'recoverable_cost_id', '')::uuid,
        (v_alloc->>'amount')::numeric,
        auth.uid()
      );

      -- Check if invoice is fully paid, update its stages to PAID
      if v_alloc_inv_id is not null then
        select total_amount into v_inv_total from finance.invoice_refs where id = v_alloc_inv_id;
        select coalesce(sum(amount), 0) into v_inv_paid from finance.payment_allocations where invoice_ref_id = v_alloc_inv_id;
        if v_inv_paid >= v_inv_total then
          update finance.billing_stages
             set billing_status = 'PAID'
           where invoice_ref_id = v_alloc_inv_id;
        end if;
      end if;
    end loop;
  end if;

  return v_payment_id;
end $$;

-- Function: create_client_and_project_code
create or replace function finance.create_client_and_project_code(
  p_client_code     text,
  p_client_name     text,
  p_entity_type     text,
  p_email           text,
  p_phone           text,
  p_gstin           text,
  p_pan             text,
  p_billing_address text,
  p_state_code      text,
  p_code            text,
  p_prefix          text,
  p_department      text,
  p_title           text
) returns jsonb
language plpgsql security invoker set search_path = finance, core as $$
declare
  v_client_id uuid;
  v_project_id uuid;
  v_normalized text;
begin
  if not core.has_role('FINANCE', 'SUPER_ADMIN') then
    raise exception 'Unauthorized: Only Finance or Super Admin can create clients & project codes';
  end if;

  -- Check if client code exists
  select id into v_client_id from core.clients where client_code = trim(p_client_code);
  if v_client_id is not null then
    raise exception 'Client code already exists — select it from the list';
  end if;

  -- Check project code normalized
  v_normalized := upper(regexp_replace(p_code, '\s', '', 'g'));
  if exists (select 1 from core.project_codes where code_normalized = v_normalized) then
    raise exception 'Project code "%" already exists across the firm', p_code;
  end if;

  insert into core.clients(
    client_code, client_name, entity_type, email, phone,
    gstin, pan, billing_address, state_code, created_by
  ) values (
    trim(p_client_code), trim(p_client_name), coalesce(p_entity_type, 'OTHER'),
    p_email, p_phone, p_gstin, p_pan, p_billing_address, p_state_code, auth.uid()
  ) returning id into v_client_id;

  insert into core.project_codes(
    code, prefix, department, client_id, title, status, owning_app, created_by
  ) values (
    trim(p_code), nullif(p_prefix, ''), coalesce(p_department, 'MISC_VENDOR'),
    v_client_id, trim(p_title), 'ACTIVE', 'FINANCE', auth.uid()
  ) returning id into v_project_id;

  return jsonb_build_object('client_id', v_client_id, 'project_code_id', v_project_id);
end $$;

-- Function: complete_stage_manually
create or replace function finance.complete_stage_manually(
  p_stage_id     uuid,
  p_completed_at timestamptz,
  p_note         text
) returns void
language plpgsql security invoker set search_path = finance, core as $$
declare
  v_pc_id uuid;
  v_trg text;
  v_name text;
begin
  if not core.has_role('FINANCE', 'SUPER_ADMIN') then
    raise exception 'Unauthorized: Only Finance or Super Admin can manually complete stages';
  end if;

  select project_code_id, trigger_event_code, name
    into v_pc_id, v_trg, v_name
    from finance.billing_stages
   where id = p_stage_id;

  if not found then
    raise exception 'Billing stage not found';
  end if;

  update finance.billing_stages
     set is_completed = true,
         completed_at = coalesce(p_completed_at, now()),
         completed_note = p_note,
         billing_status = case when billing_status = 'PENDING' then 'UNBILLED_WORK_DONE' else billing_status end
   where id = p_stage_id;

  -- Write matching core.matter_events row
  insert into core.matter_events(
    project_code_id, event_code, title, detail, occurred_at, actor_user_id, source_app
  ) values (
    v_pc_id, v_trg, 'Billing Stage Completed: ' || v_name, p_note,
    coalesce(p_completed_at, now()), auth.uid(), 'FINANCE'
  );
end $$;

-- Function: sync_matter_events_to_billing_stages
-- Core rule 2: Auto stage completion
create or replace function finance.sync_matter_events_to_billing_stages()
returns jsonb
language plpgsql security invoker set search_path = finance, core as $$
declare
  v_cursor record;
  v_event record;
  v_stage_id uuid;
  v_matched_count int := 0;
  v_new_last_created timestamptz;
  v_new_last_id uuid;
begin
  -- Get or initialize cursor
  select * into v_cursor from finance.event_cursor limit 1;
  if v_cursor is null then
    insert into finance.event_cursor(last_created_at)
    values ('1970-01-01 00:00:00+00'::timestamptz)
    returning * into v_cursor;
  end if;

  v_new_last_created := v_cursor.last_created_at;
  v_new_last_id := v_cursor.last_event_id;

  -- Read new matter events after cursor (exclude backfilled events)
  for v_event in
    select me.*
      from core.matter_events me
     where (me.created_at > v_cursor.last_created_at
            or (me.created_at = v_cursor.last_created_at and (v_cursor.last_event_id is null or me.id > v_cursor.last_event_id)))
       and me.event_code is not null
       and coalesce(me.metadata->>'backfilled', 'false') <> 'true'
     order by me.created_at asc, me.id asc
  loop
    -- Look for matching open stage of a CONFIRMED quotation on the same project code
    select bs.id into v_stage_id
      from finance.billing_stages bs
      join finance.quotations q on q.id = bs.quotation_id
     where bs.project_code_id = v_event.project_code_id
       and bs.trigger_event_code = v_event.event_code
       and bs.is_completed = false
       and bs.manual_completion = false
       and q.status = 'CONFIRMED'
     order by bs.created_at asc
     limit 1;

    if v_stage_id is not null then
      update finance.billing_stages
         set is_completed = true,
             completed_at = v_event.occurred_at,
             completed_note = 'Auto-completed via matter event: ' || v_event.event_code,
             billing_status = 'UNBILLED_WORK_DONE'
       where id = v_stage_id;

      v_matched_count := v_matched_count + 1;
    end if;

    v_new_last_created := v_event.created_at;
    v_new_last_id := v_event.id;
  end loop;

  -- Update cursor
  update finance.event_cursor
     set last_created_at = v_new_last_created,
         last_event_id = v_new_last_id,
         updated_at = now()
   where id = v_cursor.id;

  return jsonb_build_object('completed_count', v_matched_count, 'cursor_at', v_new_last_created);
end $$;

-- Function: approve_reimbursement_by_manager
create or replace function finance.approve_reimbursement_by_manager(
  p_claim_id uuid,
  p_decision text, -- 'APPROVE' or 'REJECT'
  p_note     text default null
) returns void
language plpgsql security invoker set search_path = finance, core as $$
declare
  v_claim record;
begin
  select * into v_claim from finance.reimbursement_claims where id = p_claim_id;
  if not found then
    raise exception 'Claim not found';
  end if;

  if v_claim.claimant_id = auth.uid() then
    raise exception 'Nobody can approve their own reimbursement claim';
  end if;

  if not (core.has_role('SUPER_ADMIN') or v_claim.manager_id = auth.uid()) then
    raise exception 'Unauthorized: Only the assigned reporting manager or Super Admin can decide this claim';
  end if;

  if p_decision = 'APPROVE' then
    update finance.reimbursement_claims
       set status = 'MANAGER_APPROVED',
           manager_decision_by = auth.uid(),
           manager_decision_at = now(),
           query_note = coalesce(p_note, query_note)
     where id = p_claim_id;
  else
    update finance.reimbursement_claims
       set status = 'REJECTED',
           manager_decision_by = auth.uid(),
           manager_decision_at = now(),
           query_note = p_note
     where id = p_claim_id;
  end if;
end $$;

-- Function: approve_reimbursement_by_finance
create or replace function finance.approve_reimbursement_by_finance(
  p_claim_id     uuid,
  p_decision     text, -- 'APPROVE' or 'REJECT' or 'QUERY'
  p_note         text default null,
  p_allocations  jsonb default '[]'::jsonb -- array of {project_code_id, amount}
) returns void
language plpgsql security invoker set search_path = finance, core as $$
declare
  v_claim record;
  v_alloc jsonb;
  v_rc_id uuid;
  v_cost_rule record;
  v_client_id uuid;
  v_post_status text;
begin
  if not core.has_role('FINANCE', 'SUPER_ADMIN') then
    raise exception 'Unauthorized: Only Finance or Super Admin can give Finance decisions on claims';
  end if;

  select * into v_claim from finance.reimbursement_claims where id = p_claim_id;
  if not found then
    raise exception 'Claim not found';
  end if;

  if v_claim.claimant_id = auth.uid() then
    raise exception 'Nobody can approve their own reimbursement claim';
  end if;

  if v_claim.manager_decision_by = auth.uid() and not core.has_role('SUPER_ADMIN') then
    raise exception 'The same person cannot give both Manager and Finance approvals';
  end if;

  if p_decision = 'APPROVE' then
    update finance.reimbursement_claims
       set status = 'FINANCE_APPROVED',
           finance_decision_by = auth.uid(),
           finance_decision_at = now(),
           query_note = coalesce(p_note, query_note)
     where id = p_claim_id;

    -- Insert allocations and recoverable costs
    for v_alloc in select * from jsonb_array_elements(p_allocations) loop
      select client_id into v_client_id from core.project_codes where id = (v_alloc->>'project_code_id')::uuid;

      select * into v_cost_rule from finance.posting_rules where category = 'EMPLOYEE_REIMBURSEMENT';
      v_post_status := case
        when v_cost_rule.auto_post = true then 'AUTO_POSTED'
        else 'PENDING_FINANCE'
      end;

      insert into core.recoverable_costs(
        source_app, source_type, source_id, project_code_id, client_id,
        cost_date, category, description, amount, has_evidence, posting_status,
        posted_at, created_by
      ) values (
        'FINANCE', 'EMPLOYEE_REIMBURSEMENT', p_claim_id, (v_alloc->>'project_code_id')::uuid,
        v_client_id, v_claim.expense_date, 'EMPLOYEE_REIMBURSEMENT',
        'Reimbursement: ' || v_claim.description, (v_alloc->>'amount')::numeric,
        true, v_post_status,
        case when v_post_status = 'AUTO_POSTED' then now() end,
        auth.uid()
      ) returning id into v_rc_id;

      insert into finance.reimbursement_allocations(
        claim_id, project_code_id, amount, recoverable_cost_id, created_by
      ) values (
        p_claim_id, (v_alloc->>'project_code_id')::uuid, (v_alloc->>'amount')::numeric,
        v_rc_id, auth.uid()
      );
    end loop;

  elsif p_decision = 'QUERY' then
    update finance.reimbursement_claims
       set status = 'QUERIED',
           finance_decision_by = auth.uid(),
           finance_decision_at = now(),
           query_note = p_note
     where id = p_claim_id;
  else
    update finance.reimbursement_claims
       set status = 'REJECTED',
           finance_decision_by = auth.uid(),
           finance_decision_at = now(),
           query_note = p_note
     where id = p_claim_id;
  end if;
end $$;

-- Function: mark_govt_fee_paid
create or replace function finance.mark_govt_fee_paid(
  p_request_id            uuid,
  p_transaction_reference text
) returns void
language plpgsql security invoker set search_path = finance, core as $$
declare
  v_req record;
  v_client_id uuid;
  v_rc_id uuid;
  v_rule record;
  v_post_status text;
begin
  if not core.has_role('FINANCE', 'SUPER_ADMIN', 'PARALEGAL') then
    raise exception 'Unauthorized';
  end if;

  select * into v_req from finance.govt_fee_requests where id = p_request_id;
  if not found then
    raise exception 'Govt fee request not found';
  end if;

  if p_transaction_reference is null or trim(p_transaction_reference) = '' then
    raise exception 'Transaction reference is required to mark Govt Fee as PAID';
  end if;

  select client_id into v_client_id from core.project_codes where id = v_req.project_code_id;

  if v_req.recoverable then
    select * into v_rule from finance.posting_rules where category = 'GOVT_FEE';
    v_post_status := case when coalesce(v_rule.auto_post, true) = true then 'AUTO_POSTED' else 'PENDING_FINANCE' end;

    insert into core.recoverable_costs(
      source_app, source_type, source_id, project_code_id, client_id,
      cost_date, category, description, amount, has_evidence, posting_status,
      posted_at, created_by
    ) values (
      'FINANCE', 'GOVT_FEE', p_request_id, v_req.project_code_id, v_client_id,
      current_date, 'GOVT_FEE', 'Govt Fee for ' || v_req.form, v_req.amount,
      true, v_post_status,
      case when v_post_status = 'AUTO_POSTED' then now() end,
      auth.uid()
    ) returning id into v_rc_id;
  end if;

  update finance.govt_fee_requests
     set status = 'PAID',
         paid_by = auth.uid(),
         paid_at = now(),
         transaction_reference = trim(p_transaction_reference),
         recoverable_cost_id = v_rc_id
   where id = p_request_id;
end $$;

-- ---------------------------------------------------------------------
-- 13. Audit Triggers
-- core.audit_trigger() on every table in schema finance
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in select table_name from information_schema.tables
            where table_schema = 'finance' and table_type = 'BASE TABLE'
  loop
    execute format('drop trigger if exists trg_audit_%1$s on finance.%1$s', t);
    execute format('create trigger trg_audit_%1$s after insert or update or delete on finance.%1$s
                    for each row execute function core.audit_trigger()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 14. Row Level Security Policies
-- ---------------------------------------------------------------------
alter table finance.service_catalog        enable row level security;
alter table finance.stage_templates        enable row level security;
alter table finance.client_rate_cards      enable row level security;
alter table finance.quotations             enable row level security;
alter table finance.billing_stages         enable row level security;
alter table finance.event_cursor           enable row level security;
alter table finance.invoice_refs           enable row level security;
alter table finance.invoice_ref_stages     enable row level security;
alter table finance.invoice_ref_costs      enable row level security;
alter table finance.payments               enable row level security;
alter table finance.payment_allocations    enable row level security;
alter table finance.advances               enable row level security;
alter table finance.credit_notes           enable row level security;
alter table finance.write_offs             enable row level security;
alter table finance.posting_rules          enable row level security;
alter table finance.esign_requests         enable row level security;
alter table finance.esign_signers          enable row level security;
alter table finance.fee_schedule           enable row level security;
alter table finance.govt_fee_requests      enable row level security;
alter table finance.portal_payment_records enable row level security;
alter table finance.reimbursement_payouts  enable row level security;
alter table finance.reimbursement_claims   enable row level security;
alter table finance.reimbursement_bills    enable row level security;
alter table finance.reimbursement_allocations enable row level security;
alter table finance.vendors                enable row level security;
alter table finance.misc_jobs              enable row level security;
alter table finance.cliq_outbox            enable row level security;

-- 14.1 Finance Masters & Settings
create policy p_service_catalog_all on finance.service_catalog for all
  using (core.has_role('FINANCE','SUPER_ADMIN')) with check (core.has_role('FINANCE','SUPER_ADMIN'));

create policy p_stage_templates_all on finance.stage_templates for all
  using (core.has_role('FINANCE','SUPER_ADMIN')) with check (core.has_role('FINANCE','SUPER_ADMIN'));

create policy p_rate_cards_all on finance.client_rate_cards for all
  using (core.has_role('FINANCE','SUPER_ADMIN')) with check (core.has_role('FINANCE','SUPER_ADMIN'));

create policy p_posting_rules_all on finance.posting_rules for all
  using (core.has_role('FINANCE','SUPER_ADMIN')) with check (core.has_role('FINANCE','SUPER_ADMIN'));

create policy p_event_cursor_all on finance.event_cursor for all
  using (core.has_role('FINANCE','SUPER_ADMIN')) with check (core.has_role('FINANCE','SUPER_ADMIN'));

-- 14.2 Quotations & Billing Stages (Paralegals must NEVER see)
create policy p_quotations_all on finance.quotations for all
  using (core.has_role('FINANCE','SUPER_ADMIN')) with check (core.has_role('FINANCE','SUPER_ADMIN'));

create policy p_billing_stages_all on finance.billing_stages for all
  using (core.has_role('FINANCE','SUPER_ADMIN')) with check (core.has_role('FINANCE','SUPER_ADMIN'));

-- 14.3 Invoices, Payments, Advances, Ledgers
create policy p_invoice_refs_all on finance.invoice_refs for all
  using (core.has_role('FINANCE','SUPER_ADMIN')) with check (core.has_role('FINANCE','SUPER_ADMIN'));

create policy p_invoice_stages_all on finance.invoice_ref_stages for all
  using (core.has_role('FINANCE','SUPER_ADMIN')) with check (core.has_role('FINANCE','SUPER_ADMIN'));

create policy p_invoice_costs_all on finance.invoice_ref_costs for all
  using (core.has_role('FINANCE','SUPER_ADMIN')) with check (core.has_role('FINANCE','SUPER_ADMIN'));

create policy p_payments_all on finance.payments for all
  using (core.has_role('FINANCE','SUPER_ADMIN')) with check (core.has_role('FINANCE','SUPER_ADMIN'));

create policy p_payment_alloc_all on finance.payment_allocations for all
  using (core.has_role('FINANCE','SUPER_ADMIN')) with check (core.has_role('FINANCE','SUPER_ADMIN'));

create policy p_advances_all on finance.advances for all
  using (core.has_role('FINANCE','SUPER_ADMIN')) with check (core.has_role('FINANCE','SUPER_ADMIN'));

create policy p_credit_notes_all on finance.credit_notes for all
  using (core.has_role('FINANCE','SUPER_ADMIN')) with check (core.has_role('FINANCE','SUPER_ADMIN'));

create policy p_write_offs_all on finance.write_offs for all
  using (core.has_role('FINANCE','SUPER_ADMIN')) with check (core.has_role('FINANCE','SUPER_ADMIN'));

-- 14.4 E-Sign
create policy p_esign_req_all on finance.esign_requests for all
  using (core.has_role('FINANCE','SUPER_ADMIN')) with check (core.has_role('FINANCE','SUPER_ADMIN'));

create policy p_esign_signers_all on finance.esign_signers for all
  using (core.has_role('FINANCE','SUPER_ADMIN')) with check (core.has_role('FINANCE','SUPER_ADMIN'));

-- 14.5 Fee Schedule (All staff can see statutory amounts, only Finance edits)
create policy p_fee_schedule_read on finance.fee_schedule for select using (core.is_staff());
create policy p_fee_schedule_write on finance.fee_schedule for all
  using (core.has_role('FINANCE','SUPER_ADMIN')) with check (core.has_role('FINANCE','SUPER_ADMIN'));

-- 14.6 Govt Fee Requests (Paralegal can create, view own, and mark paid)
create policy p_govt_fee_read on finance.govt_fee_requests for select
  using (core.has_role('FINANCE','SUPER_ADMIN') or requested_by = auth.uid());

create policy p_govt_fee_insert on finance.govt_fee_requests for insert
  with check (core.is_staff() and requested_by = auth.uid());

create policy p_govt_fee_update on finance.govt_fee_requests for update
  using (core.has_role('FINANCE','SUPER_ADMIN') or (requested_by = auth.uid() and status in ('REQUESTED','APPROVED')));

-- 14.7 Portal Payment Records (Paralegal & Finance can enter and match)
create policy p_portal_pay_read on finance.portal_payment_records for select
  using (core.has_role('FINANCE','SUPER_ADMIN','PARALEGAL'));

create policy p_portal_pay_insert on finance.portal_payment_records for insert
  with check (core.has_role('FINANCE','SUPER_ADMIN','PARALEGAL') and entered_by = auth.uid());

create policy p_portal_pay_update on finance.portal_payment_records for update
  using (core.has_role('FINANCE','SUPER_ADMIN'));

-- 14.8 Reimbursements (Staff sees own, Manager sees team, Finance sees all)
create policy p_reimb_payouts_all on finance.reimbursement_payouts for all
  using (core.has_role('FINANCE','SUPER_ADMIN')) with check (core.has_role('FINANCE','SUPER_ADMIN'));

create policy p_reimb_claims_select on finance.reimbursement_claims for select
  using (core.has_role('FINANCE','SUPER_ADMIN') or claimant_id = auth.uid() or manager_id = auth.uid());

create policy p_reimb_claims_insert on finance.reimbursement_claims for insert
  with check (core.is_staff() and claimant_id = auth.uid());

create policy p_reimb_claims_update on finance.reimbursement_claims for update
  using (core.has_role('FINANCE','SUPER_ADMIN') or claimant_id = auth.uid() or manager_id = auth.uid());

create policy p_reimb_bills_select on finance.reimbursement_bills for select
  using (core.has_role('FINANCE','SUPER_ADMIN') or created_by = auth.uid());

create policy p_reimb_bills_insert on finance.reimbursement_bills for insert
  with check (core.is_staff() and created_by = auth.uid());

create policy p_reimb_alloc_select on finance.reimbursement_allocations for select
  using (core.has_role('FINANCE','SUPER_ADMIN') or created_by = auth.uid());

create policy p_reimb_alloc_insert on finance.reimbursement_allocations for insert
  with check (core.has_role('FINANCE','SUPER_ADMIN') or created_by = auth.uid());

-- 14.9 Vendors & Misc Jobs
create policy p_vendors_all on finance.vendors for all
  using (core.has_role('FINANCE','SUPER_ADMIN')) with check (core.has_role('FINANCE','SUPER_ADMIN'));

create policy p_misc_jobs_all on finance.misc_jobs for all
  using (core.has_role('FINANCE','SUPER_ADMIN')) with check (core.has_role('FINANCE','SUPER_ADMIN'));

create policy p_cliq_outbox_all on finance.cliq_outbox for all
  using (core.has_role('FINANCE','SUPER_ADMIN')) with check (core.has_role('FINANCE','SUPER_ADMIN'));

-- ---------------------------------------------------------------------
-- 15. Default Settings & Seed Catalogs
-- ---------------------------------------------------------------------
insert into core.app_settings(app, key, value) values
  ('FINANCE', 'gst_rate_percent', '18'::jsonb),
  ('FINANCE', 'firm_state_code', '"27"'::jsonb),
  ('FINANCE', 'reminder_days', '5'::jsonb),
  ('FINANCE', 'claim_window_days', '60'::jsonb),
  ('FINANCE', 'payout_weekday', '"FRIDAY"'::jsonb)
on conflict (app, key) do update set value = excluded.value;

-- Seed: Posting Rules
insert into finance.posting_rules (category, recoverable, auto_post) values
  ('OFFICE_EXPENSE', true, false),
  ('GOVT_FEE', true, true),
  ('EMPLOYEE_REIMBURSEMENT', true, true),
  ('COURIER_POSTAGE', true, true),
  ('PRINTING_BINDING', true, false),
  ('COURT_FEE', true, true),
  ('MISC_VENDOR', true, true),
  ('NON_RECOVERABLE_OVERHEAD', false, false)
on conflict (category) do nothing;

-- Seed: Service Catalog
insert into finance.service_catalog (name, default_fee) values
  ('Patent Provisional Filing (PS)', 20000.00),
  ('Patent Complete Specification (CS)', 25000.00),
  ('Patent Request for Examination (RFE)', 5000.00),
  ('Patent FER Response', 15000.00),
  ('Patent Hearing Attendance', 12000.00),
  ('Trademark Application (TM-A)', 8000.00),
  ('Trademark Reply to Examination', 6000.00),
  ('Trademark Opposition Hearing', 15000.00),
  ('Copyright Application', 10000.00),
  ('Design Registration Application', 12000.00),
  ('Commercial Suit Litigation', 75000.00),
  ('High Court Writ Petition', 85000.00),
  ('NCLT Company Petition', 90000.00),
  ('Agreement Drafting (Master Services / NDA)', 25000.00),
  ('Legal Notice & Representation', 15000.00)
on conflict do nothing;

-- Seed: Stage Templates
insert into finance.stage_templates (name, items) values
  ('Litigation Suit Stages', '[
    {"stage_key": "NOTICE", "name": "Legal Notice Sent", "percent": 15, "trigger_event_code": "LEGAL_NOTICE_SENT", "manual": false},
    {"stage_key": "FILED", "name": "Suit / Petition Filed", "percent": 35, "trigger_event_code": "SUIT_FILED", "manual": false},
    {"stage_key": "INTERIM", "name": "Interim Application Order", "percent": 25, "trigger_event_code": "IA_ORDER", "manual": false},
    {"stage_key": "ARGUMENTS", "name": "Final Arguments", "percent": 15, "trigger_event_code": "FINAL_ARGUMENTS", "manual": false},
    {"stage_key": "JUDGMENT", "name": "Judgment / Disposal", "percent": 10, "trigger_event_code": "JUDGMENT", "manual": false}
  ]'::jsonb),
  ('Agreement / Contract Stages', '[
    {"stage_key": "INTAKE", "name": "Instructions Intake", "percent": 20, "trigger_event_code": "AGR_INTAKE", "manual": false},
    {"stage_key": "FIRST_DRAFT", "name": "First Draft Delivered", "percent": 40, "trigger_event_code": "AGR_V1_SENT", "manual": false},
    {"stage_key": "FINALIZED", "name": "Final Version Approved", "percent": 20, "trigger_event_code": "AGR_FINALIZED", "manual": false},
    {"stage_key": "EXECUTED", "name": "Execution & Stamping", "percent": 20, "trigger_event_code": "AGR_EXECUTED", "manual": false}
  ]'::jsonb),
  ('Patent Prosecution (Standard)', '[
    {"stage_key": "PROVISIONAL", "name": "Provisional Filing", "percent": 30, "trigger_event_code": "PS_FILED", "manual": false},
    {"stage_key": "COMPLETE", "name": "Complete Specification", "percent": 30, "trigger_event_code": "CS_FILED", "manual": false},
    {"stage_key": "FER", "name": "FER Response Filing", "percent": 25, "trigger_event_code": "FER_REPLY_FILED", "manual": false},
    {"stage_key": "GRANT", "name": "Hearing & Post-Hearing WS", "percent": 15, "trigger_event_code": "PATENT_WS_FILED", "manual": false}
  ]'::jsonb),
  ('Trademark Application', '[
    {"stage_key": "TM_APPLY", "name": "Trademark Application Filed", "percent": 60, "trigger_event_code": "TM_FILED", "manual": false},
    {"stage_key": "TM_RESPONSE", "name": "Examination Reply", "percent": 20, "trigger_event_code": "TM_REPLY_FILED", "manual": false},
    {"stage_key": "TM_REG", "name": "Registration Certificate", "percent": 20, "trigger_event_code": "TM_REGISTERED", "manual": false}
  ]'::jsonb),
  ('Patent Custom Milestone (Manual Completion)', '[
    {"stage_key": "DRAFTING", "name": "Patent Specification Drafting", "percent": 50, "trigger_event_code": null, "manual": true},
    {"stage_key": "FILING_REVIEW", "name": "Patent Office Filing & Formalities", "percent": 50, "trigger_event_code": null, "manual": true}
  ]'::jsonb)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 16. Permissions & Grant Clauses
-- ---------------------------------------------------------------------
grant usage on schema finance to authenticated, service_role;
grant all on all tables in schema finance to service_role;
grant select, insert, update, delete on all tables in schema finance to authenticated;
grant execute on all functions in schema finance to authenticated;

notify pgrst, 'reload schema';
