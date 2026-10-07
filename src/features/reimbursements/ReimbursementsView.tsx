// src/features/reimbursements/ReimbursementsView.tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Receipt, PlusCircle, Search, CheckCircle2, Clock, 
  HelpCircle, XCircle, DollarSign, Filter, AlertTriangle, ShieldCheck
} from 'lucide-react';
import { financeDb, coreDb } from '../../lib/supabase';
import { formatINR } from '../../lib/currency';
import { formatDate } from '../../lib/clock';
import { useAuth } from '../../lib/auth';
import NewClaimModal from './NewClaimModal';
import PayoutsTab from './PayoutsTab';
import type { ReimbursementClaim, CoreProjectCode } from '../../lib/types';

export default function ReimbursementsView() {
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'MY_CLAIMS' | 'MANAGER' | 'FINANCE' | 'PAYOUTS'>('MY_CLAIMS');
  const [search, setSearch] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [financeActionClaim, setFinanceActionClaim] = useState<ReimbursementClaim | null>(null);
  const [selectedProjectCodeId, setSelectedProjectCodeId] = useState('');
  const [financeNote, setFinanceNote] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Fetch all claims using view
  const { data: claims = [], isLoading, refetch } = useQuery({
    queryKey: ['reimbursement-claims-view'],
    queryFn: async () => {
      const { data, error } = await financeDb
        .from('reimbursement_claims_view')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as ReimbursementClaim[];
    }
  });

  // Fetch project codes for Finance matter allocation
  const { data: projectCodes = [] } = useQuery({
    queryKey: ['core-project-codes-list'],
    queryFn: async () => {
      const { data, error } = await coreDb
        .from('project_codes')
        .select('id, code, title, client_id, clients:client_id(client_name)')
        .order('code');
      if (error) throw error;
      return (data || []) as any[];
    }
  });

  // Tab filtering
  const myClaims = claims.filter(c => c.claimant_id === user?.id);
  const managerClaims = claims.filter(c => 
    c.status === 'SUBMITTED' && 
    (profile?.role === 'SUPER_ADMIN' || c.manager_id === user?.id)
  );
  const financeQueue = claims.filter(c => c.status === 'MANAGER_APPROVED');

  const currentTabList = 
    activeTab === 'MY_CLAIMS' ? myClaims :
    activeTab === 'MANAGER' ? managerClaims :
    activeTab === 'FINANCE' ? financeQueue : [];

  const filtered = currentTabList.filter(c => {
    const q = search.toLowerCase();
    return (
      c.description.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q) ||
      c.claimant_name?.toLowerCase().includes(q)
    );
  });

  // Manager Approve / Reject
  const handleManagerDecision = async (claim: ReimbursementClaim, decision: 'APPROVE' | 'REJECT') => {
    if (claim.claimant_id === user?.id) {
      alert('Violation: Firm policy prohibits approving your own reimbursement claim.');
      return;
    }

    const note = decision === 'REJECT' ? prompt('Reason for rejection:') : null;
    if (decision === 'REJECT' && note === null) return;

    try {
      setIsProcessing(true);
      const { error } = await financeDb.rpc('approve_reimbursement_by_manager', {
        p_claim_id: claim.id,
        p_decision: decision,
        p_note: note
      });
      if (error) throw error;
      refetch();
    } catch (err: any) {
      alert(err.message || 'Failed to record decision');
    } finally {
      setIsProcessing(false);
    }
  };

  // Finance Decision (APPROVE / QUERY / REJECT)
  const handleFinanceSubmit = async (decision: 'APPROVE' | 'QUERY' | 'REJECT') => {
    if (!financeActionClaim) return;

    if (decision === 'APPROVE' && !selectedProjectCodeId) {
      alert('Please select a project code to allocate this client recoverable disbursement');
      return;
    }

    try {
      setIsProcessing(true);
      const allocations = decision === 'APPROVE' ? [
        { project_code_id: selectedProjectCodeId, amount: financeActionClaim.amount }
      ] : [];

      const { error } = await financeDb.rpc('approve_reimbursement_by_finance', {
        p_claim_id: financeActionClaim.id,
        p_decision: decision,
        p_note: financeNote.trim() || null,
        p_allocations: allocations
      });

      if (error) throw error;
      setFinanceActionClaim(null);
      setSelectedProjectCodeId('');
      setFinanceNote('');
      refetch();
    } catch (err: any) {
      alert(err.message || 'Failed to submit Finance decision');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
              <Receipt className="w-6 h-6" />
            </div>
            Employee Reimbursements
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Two-stage manager & finance approval workflows, receipt audit, and batch payouts
          </p>
        </div>

        <button
          onClick={() => setShowNewModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition"
        >
          <PlusCircle className="w-4 h-4" />
          Submit New Claim
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 overflow-x-auto">
        <button
          onClick={() => setActiveTab('MY_CLAIMS')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'MY_CLAIMS'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Receipt className="w-4 h-4" />
          My Claims ({myClaims.length})
        </button>
        <button
          onClick={() => setActiveTab('MANAGER')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'MANAGER'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Clock className="w-4 h-4" />
          Manager Approvals ({managerClaims.length})
        </button>
        <button
          onClick={() => setActiveTab('FINANCE')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'FINANCE'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          Finance Review Queue ({financeQueue.length})
        </button>
        <button
          onClick={() => setActiveTab('PAYOUTS')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'PAYOUTS'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          Weekly Payouts
        </button>
      </div>

      {activeTab === 'PAYOUTS' ? (
        <PayoutsTab onRefresh={refetch} />
      ) : (
        <div className="space-y-4">
          {/* Search bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search description, employee, category..."
                className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Claims Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {isLoading ? (
              <div className="p-12 text-center text-slate-400 text-sm">Loading claims...</div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center">
                <Receipt className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-slate-800">No claims in this queue</h3>
                <p className="text-xs text-slate-400 mt-1">Expenses submitted will appear here for review</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50/75 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-5 py-3.5">Date</th>
                      <th className="px-5 py-3.5">Claimant</th>
                      <th className="px-5 py-3.5">Category</th>
                      <th className="px-5 py-3.5">Description & Bill</th>
                      <th className="px-5 py-3.5 text-right">Amount (₹)</th>
                      <th className="px-5 py-3.5 text-center">Status</th>
                      <th className="px-5 py-3.5 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filtered.map(c => {
                      const isOwner = c.claimant_id === user?.id;

                      return (
                        <tr key={c.id} className="hover:bg-slate-50/60 transition">
                          <td className="px-5 py-4 text-xs font-medium text-slate-600 whitespace-nowrap">
                            {formatDate(c.expense_date)}
                          </td>
                          <td className="px-5 py-4">
                            <div className="font-semibold text-slate-900">{c.claimant_name}</div>
                            <div className="text-xs text-slate-400">{c.claimant_department || 'Staff'}</div>
                          </td>
                          <td className="px-5 py-4">
                            <span className="inline-block px-2 py-0.5 text-xs font-semibold bg-slate-100 text-slate-700 rounded-md">
                              {c.category}
                            </span>
                          </td>
                          <td className="px-5 py-4 max-w-sm">
                            <div className="font-medium text-slate-800">{c.description}</div>
                            {c.bill_override_reason ? (
                              <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 mt-1">
                                <AlertTriangle className="w-3 h-3" /> No Bill: {c.bill_override_reason}
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400 block mt-0.5">Receipt Verified</span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-right font-mono font-bold text-slate-900">
                            {formatINR(c.amount)}
                          </td>
                          <td className="px-5 py-4 text-center">
                            {c.status === 'PAID' ? (
                              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
                                <CheckCircle2 className="w-3 h-3" /> Paid
                              </span>
                            ) : c.status === 'FINANCE_APPROVED' ? (
                              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-800 font-semibold">
                                Finance Approved
                              </span>
                            ) : c.status === 'MANAGER_APPROVED' ? (
                              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                                Mgr Approved
                              </span>
                            ) : c.status === 'SUBMITTED' ? (
                              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">
                                <Clock className="w-3 h-3" /> Submitted
                              </span>
                            ) : c.status === 'QUERIED' ? (
                              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 font-semibold">
                                <HelpCircle className="w-3 h-3" /> Queried
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 font-semibold">
                                <XCircle className="w-3 h-3" /> Rejected
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {/* Manager Actions */}
                              {activeTab === 'MANAGER' && (
                                isOwner ? (
                                  <span className="text-xs text-slate-400 italic">Self (Cannot Approve)</span>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => handleManagerDecision(c, 'APPROVE')}
                                      disabled={isProcessing}
                                      className="px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition"
                                    >
                                      Approve
                                    </button>
                                    <button
                                      onClick={() => handleManagerDecision(c, 'REJECT')}
                                      disabled={isProcessing}
                                      className="px-2 py-1 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg transition"
                                    >
                                      Reject
                                    </button>
                                  </>
                                )
                              )}

                              {/* Finance Actions */}
                              {activeTab === 'FINANCE' && (
                                <button
                                  onClick={() => setFinanceActionClaim(c)}
                                  className="px-3 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition"
                                >
                                  Review & Allocate
                                </button>
                              )}

                              {activeTab === 'MY_CLAIMS' && (
                                <span className="text-xs text-slate-400 font-mono">
                                  {c.status === 'PAID' ? 'Disbursed' : 'Under Review'}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Finance Decision Modal */}
      {financeActionClaim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-xl border border-slate-200 max-w-lg w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Finance Review & Allocation</h3>
            <p className="text-xs text-slate-500 mb-4">
              Claim from {financeActionClaim.claimant_name}: {financeActionClaim.description} ({formatINR(financeActionClaim.amount)})
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Allocate to Client Matter (for Pure Agent Recovery) *
                </label>
                <select
                  value={selectedProjectCodeId}
                  onChange={(e) => setSelectedProjectCodeId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">-- Select Project Code --</option>
                  {projectCodes.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.title} ({p.clients?.client_name})
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Creates an automatic recoverable cost in core.recoverable_costs
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Finance Notes / Query Clarification
                </label>
                <textarea
                  rows={2}
                  value={financeNote}
                  onChange={(e) => setFinanceNote(e.target.value)}
                  placeholder="Notes for claimant or audit trail..."
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setFinanceActionClaim(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleFinanceSubmit('QUERY')}
                    disabled={isProcessing}
                    className="px-3 py-2 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-xl border border-purple-200"
                  >
                    Query Clarification
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFinanceSubmit('REJECT')}
                    disabled={isProcessing}
                    className="px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl border border-rose-200"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFinanceSubmit('APPROVE')}
                    disabled={isProcessing || !selectedProjectCodeId}
                    className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs disabled:opacity-50"
                  >
                    Approve & Allocate
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Claim Modal */}
      {showNewModal && (
        <NewClaimModal
          onClose={() => setShowNewModal(false)}
          onSuccess={() => {
            setShowNewModal(false);
            refetch();
          }}
        />
      )}
    </div>
  );
}
