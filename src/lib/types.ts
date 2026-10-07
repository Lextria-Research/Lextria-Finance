// src/lib/types.ts
// Domain interfaces for Lextria Finance & Core Schemas

import type { Role, Department } from './auth';

// --- Core Schema Types ---
export interface CoreClient {
  id: string;
  client_code: string;
  client_name: string;
  entity_type: 'NATURAL_PERSON' | 'STARTUP' | 'SMALL_ENTITY' | 'EDUCATIONAL_INSTITUTION' | 'LARGE_ENTITY' | 'GOVERNMENT' | 'OTHER';
  email?: string | null;
  phone?: string | null;
  gstin?: string | null;
  pan?: string | null;
  billing_address?: string | null;
  state_code?: string | null;
  workdrive_folder_id?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CoreProjectCode {
  id: string;
  code: string;
  code_normalized: string;
  prefix?: string | null;
  department: 'IP_PATENT' | 'IP_SOFT' | 'LITIGATION' | 'AGREEMENT' | 'MISC_VENDOR' | 'OTHER';
  client_id: string;
  title: string;
  status: 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ABANDONED' | 'DUPLICATE_REVIEW';
  spoc_user_id?: string | null;
  lead_assignee_id?: string | null;
  workdrive_folder_id?: string | null;
  owning_app: string;
  created_by?: string | null;
  created_at: string;
}

export interface CoreMatterEvent {
  id: string;
  project_code_id: string;
  event_code?: string | null;
  title: string;
  detail?: string | null;
  occurred_at: string;
  actor_user_id?: string | null;
  source_app: string;
  client_visible: boolean;
  client_label?: string | null;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface CoreRecoverableCost {
  id: string;
  source_app: string;
  source_type: 'OFFICE_EXPENSE' | 'EMPLOYEE_REIMBURSEMENT' | 'GOVT_FEE' | 'OTHER';
  source_id?: string | null;
  project_code_id: string;
  client_id?: string | null;
  cost_date: string;
  category: string;
  description: string;
  amount: number;
  has_evidence: boolean;
  evidence_document_id?: string | null;
  posting_status: 'PENDING_FINANCE' | 'AUTO_POSTED' | 'NEEDS_REVIEW' | 'NOT_RECOVERABLE' | 'REVERSED';
  posted_at?: string | null;
  reviewed_by?: string | null;
  review_note?: string | null;
  reversal_of?: string | null;
  recovered_via_invoice_ref_id?: string | null;
  created_by?: string | null;
  created_at: string;
  // joined fields from view
  client_code?: string;
  client_name?: string;
  project_code?: string;
  project_title?: string;
  evidence_file_name?: string;
  evidence_permalink?: string;
  creator_name?: string;
  reviewer_name?: string;
}

export interface CorePettyCashTopup {
  id: string;
  amount: number;
  reason: string;
  requested_by: string;
  requested_at: string;
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'HANDED_OVER';
  decided_by?: string | null;
  decided_at?: string | null;
  decision_note?: string | null;
  handed_over_at?: string | null;
}

export interface CorePettyCashCount {
  id: string;
  count_date: string;
  counted_by: string;
  physical_cash: number;
  book_balance: number;
  variance: number;
  note?: string | null;
  finance_signoff_by?: string | null;
  finance_signoff_at?: string | null;
  finance_note?: string | null;
}

// --- Finance Schema Types ---
export interface ServiceCatalogItem {
  id: string;
  name: string;
  default_fee: number;
  active: boolean;
  created_at: string;
  created_by?: string | null;
}

export interface StageTemplateItem {
  stage_key: string;
  name: string;
  percent: number;
  trigger_event_code?: string | null;
  manual?: boolean;
}

export interface StageTemplate {
  id: string;
  name: string;
  items: StageTemplateItem[];
  active: boolean;
  created_at: string;
}

export interface ClientRateCard {
  id: string;
  client_id: string;
  service_id: string;
  fee: number;
  valid_from: string;
  created_at: string;
  service_name?: string;
}

export type QuotationStatus = 'DRAFT' | 'SENT' | 'CONFIRMED' | 'REJECTED' | 'SUPERSEDED' | 'CANCELLED';

export interface Quotation {
  id: string;
  project_code_id: string;
  client_id: string;
  quote_number: string;
  version: number;
  status: QuotationStatus;
  total_prof_fee: number;
  est_govt_fee: number;
  gst_applicable: boolean;
  confirmed_via?: 'ESIGN' | 'OVERRIDE' | null;
  override_reason?: string | null;
  override_document_id?: string | null;
  amendment_reason?: string | null;
  supersedes_id?: string | null;
  notes?: string | null;
  confirmed_at?: string | null;
  created_at: string;
  created_by?: string | null;
  // joined fields
  client_code?: string;
  client_name?: string;
  client_state_code?: string;
  project_code?: string;
  project_title?: string;
  creator_name?: string;
  stages_count?: number;
  completed_stages_count?: number;
}

export type BillingStatus = 'PENDING' | 'UNBILLED_WORK_DONE' | 'INVOICED' | 'PAID';

export interface BillingStage {
  id: string;
  quotation_id: string;
  project_code_id: string;
  stage_key: string;
  name: string;
  allocated_amount: number;
  trigger_event_code?: string | null;
  manual_completion: boolean;
  is_completed: boolean;
  completed_at?: string | null;
  completed_note?: string | null;
  billing_status: BillingStatus;
  invoice_ref_id?: string | null;
  created_at: string;
  created_by?: string | null;
  // joined fields
  quote_number?: string;
  quote_version?: number;
  quote_status?: string;
  client_id?: string;
  client_code?: string;
  client_name?: string;
  project_code?: string;
  project_title?: string;
  zoho_books_invoice_no?: string;
}

export interface InvoiceRef {
  id: string;
  zoho_books_invoice_no: string;
  invoice_date: string;
  client_id: string;
  professional_taxable: number;
  gst_amount: number;
  reimbursement_amount: number;
  total_amount: number;
  notes?: string | null;
  created_at: string;
  created_by?: string | null;
  // joined fields
  client_code?: string;
  client_name?: string;
  client_state_code?: string;
  client_gstin?: string;
  stages_count?: number;
  costs_count?: number;
  paid_amount?: number;
  outstanding_amount?: number;
}

export interface Payment {
  id: string;
  client_id: string;
  received_date: string;
  gross_amount: number;
  tds_amount: number;
  net_amount: number;
  mode: 'NEFT' | 'RTGS' | 'IMPS' | 'UPI' | 'CHEQUE' | 'CASH' | 'OTHER';
  reference?: string | null;
  notes?: string | null;
  created_at: string;
  created_by?: string | null;
  client_code?: string;
  client_name?: string;
}

export interface PaymentAllocation {
  id: string;
  payment_id: string;
  invoice_ref_id?: string | null;
  recoverable_cost_id?: string | null;
  amount: number;
  created_at: string;
}

export interface Advance {
  id: string;
  client_id: string;
  received_date: string;
  amount: number;
  reference?: string | null;
  allocated_amount: number;
  notes?: string | null;
  created_at: string;
  created_by?: string | null;
  client_code?: string;
  client_name?: string;
}

export interface CreditNote {
  id: string;
  client_id: string;
  invoice_ref_id: string;
  amount: number;
  reason: string;
  approved_by?: string | null;
  created_at: string;
  created_by?: string | null;
  client_code?: string;
  client_name?: string;
  zoho_books_invoice_no?: string;
}

export interface WriteOff {
  id: string;
  client_id: string;
  invoice_ref_id: string;
  amount: number;
  reason: string;
  approved_by?: string | null;
  created_at: string;
  created_by?: string | null;
  client_code?: string;
  client_name?: string;
  zoho_books_invoice_no?: string;
}

export interface PostingRule {
  id: string;
  category: string;
  recoverable: boolean;
  auto_post: boolean;
  created_at: string;
}

export interface EsignRequest {
  id: string;
  document_type: 'QUOTATION' | 'ENGAGEMENT_LETTER' | 'MOU' | 'FEE_AGREEMENT';
  project_code_id: string;
  client_id: string;
  quotation_id?: string | null;
  leegality_document_id?: string | null;
  sent_at?: string | null;
  sent_by?: string | null;
  status: 'DRAFT' | 'SENT' | 'PARTIALLY_SIGNED' | 'SIGNED' | 'DECLINED' | 'EXPIRED' | 'CANCELLED';
  completed_at?: string | null;
  signed_document_id?: string | null;
  created_at: string;
  created_by?: string | null;
}

export interface FeeScheduleItem {
  id: string;
  office: string;
  form_or_action: string;
  applicant_fee_category: string;
  efiling_amount: number;
  effective_from: string;
  created_at: string;
}

export interface GovtFeeRequest {
  id: string;
  project_code_id: string;
  form: string;
  applicant_fee_category: string;
  amount: number;
  adjustment_reason?: string | null;
  requested_by: string;
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'PAID' | 'RECONCILED' | 'REFUND_PENDING' | 'REFUNDED';
  approved_by?: string | null;
  approved_at?: string | null;
  paid_by?: string | null;
  paid_at?: string | null;
  transaction_reference?: string | null;
  recoverable: boolean;
  recoverable_cost_id?: string | null;
  created_at: string;
  created_by?: string | null;
  // joined fields
  project_code?: string;
  project_title?: string;
  client_id?: string;
  client_code?: string;
  client_name?: string;
  requester_name?: string;
  approver_name?: string;
  payer_name?: string;
}

export interface PortalPaymentRecord {
  id: string;
  payment_date: string;
  office: string;
  reference: string;
  amount: number;
  identifier?: string | null;
  entered_by: string;
  match_status: 'UNMATCHED' | 'MATCHED' | 'RESOLVED';
  matched_request_id?: string | null;
  resolution_note?: string | null;
  created_at: string;
  created_by?: string | null;
}

export interface ReimbursementClaim {
  id: string;
  claimant_id: string;
  expense_date: string;
  category: 'FUEL' | 'PURCHASE' | 'TRAVEL' | 'FOOD' | 'POSTAGE_COURIER' | 'FEE_PAID_PERSONALLY' | 'OTHER';
  description: string;
  amount: number;
  paid_with: 'OWN_CASH' | 'OWN_UPI' | 'OWN_CARD';
  bill_override_by?: string | null;
  bill_override_reason?: string | null;
  status: 'SUBMITTED' | 'MANAGER_APPROVED' | 'FINANCE_APPROVED' | 'PAID' | 'QUERIED' | 'REJECTED';
  manager_id?: string | null;
  manager_decision_by?: string | null;
  manager_decision_at?: string | null;
  finance_decision_by?: string | null;
  finance_decision_at?: string | null;
  query_note?: string | null;
  payout_id?: string | null;
  created_at: string;
  created_by?: string | null;
  // joined fields
  claimant_name?: string;
  claimant_email?: string;
  claimant_department?: string;
  manager_name?: string;
  finance_decision_maker_name?: string;
  override_approver_name?: string;
  payout_reference?: string;
  payout_date?: string;
  bills_count?: number;
  allocations_count?: number;
}

export interface ReimbursementPayout {
  id: string;
  payout_date: string;
  method: 'BANK_TRANSFER' | 'UPI';
  reference?: string | null;
  total: number;
  paid_by: string;
  created_at: string;
  created_by?: string | null;
}

export interface Vendor {
  id: string;
  name: string;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  pan?: string | null;
  services?: string[];
  active: boolean;
  created_at: string;
  created_by?: string | null;
}

export interface MiscJob {
  id: string;
  project_code_id: string;
  client_id: string;
  work_type: string;
  description: string;
  vendor_id?: string | null;
  status: 'RECEIVED' | 'SENT_TO_VENDOR' | 'IN_PROGRESS' | 'AWAITING_CLIENT_DOCS' | 'COMPLETED' | 'DELIVERED_TO_CLIENT' | 'CANCELLED';
  client_due_date?: string | null;
  statutory_due_date?: string | null;
  amount_charged: number;
  vendor_cost: number;
  zoho_books_invoice_no?: string | null;
  vendor_bill_no?: string | null;
  vendor_bill_date?: string | null;
  vendor_payment_status: 'UNPAID' | 'PAID';
  vendor_paid_date?: string | null;
  vendor_tds: number;
  created_at: string;
  created_by?: string | null;
  // joined fields
  project_code?: string;
  project_title?: string;
  client_code?: string;
  client_name?: string;
  vendor_name?: string;
  margin_amount?: number;
  margin_percent?: number;
}

export interface ClientLedgerEntry {
  id: string;
  client_id: string;
  line_date: string;
  entry_type: 'INVOICE' | 'RECOVERABLE_COST' | 'PAYMENT' | 'CREDIT_NOTE' | 'WRITE_OFF' | 'REVERSAL';
  description: string;
  debit: number;
  credit: number;
  running_balance: number;
  created_at: string;
}
