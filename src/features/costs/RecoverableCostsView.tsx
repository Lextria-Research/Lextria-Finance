// src/features/costs/RecoverableCostsView.tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Receipt, Search, PlusCircle, CheckCircle2, XCircle, RotateCcw, 
  ExternalLink, FileText, AlertCircle, Filter, Download
} from 'lucide-react';
import { financeDb, coreDb } from '../../lib/supabase';
import { formatINR } from '../../lib/currency';
import { formatDate, todayDateStr } from '../../lib/clock';
import { getStoredUser } from '../../lib/auth';
import type { CoreRecoverableCost, CoreProjectCode } from '../../lib/types';

export default function RecoverableCostsView() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'POSTED' | 'BILLED' | 'REVERSED'>('ALL');
  const [showAddModal, setShowAddModal] = useState(false);
  const [reverseTarget, setReverseTarget] = useState<CoreRecoverableCost | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Fetch recoverable costs from view
  const { data: costs = [], isLoading, refetch } = useQuery({
    queryKey: ['recoverable-costs-view'],
    queryFn: async () => {
      const { data, error } = await financeDb
        .from('recoverable_costs_view')
        .select('*')
        .order('cost_date', { ascending: false });
      if (error) throw error;
      return (data || []) as CoreRecoverableCost[];
    }
  });

  // Filter
  const filtered = costs.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = 
      c.description.toLowerCase().includes(q) ||
      c.project_code?.toLowerCase().includes(q) ||
      c.client_name?.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q);

    if (!matchSearch) return false;

    if (statusFilter === 'PENDING') return c.posting_status === 'PENDING_FINANCE';
    if (statusFilter === 'POSTED') return c.posting_status === 'AUTO_POSTED' && !c.recovered_via_invoice_ref_id;
    if (statusFilter === 'BILLED') return !!c.recovered_via_invoice_ref_id;
    if (statusFilter === 'REVERSED') return c.posting_status === 'REVERSED' || c.posting_status === 'NOT_RECOVERABLE';
    return true;
  });

  // KPI calculations
  const pendingCount = costs.filter(c => c.posting_status === 'PENDING_FINANCE').length;
  const pendingAmount = costs.filter(c => c.posting_status === 'PENDING_FINANCE').reduce((s, c) => s + Number(c.amount || 0), 0);
  const unbilledPostedAmount = costs.filter(c => c.posting_status === 'AUTO_POSTED' && !c.recovered_via_invoice_ref_id).reduce((s, c) => s + Number(c.amount || 0), 0);
  const recoveredAmount = costs.filter(c => !!c.recovered_via_invoice_ref_id).reduce((s, c) => s + Number(c.amount || 0), 0);

  // Post / Approve
  const handlePostCost = async (cost: CoreRecoverableCost) => {
    try {
      setIsProcessing(true);
      const { error } = await coreDb
        .from('recoverable_costs')
        .update({
          posting_status: 'AUTO_POSTED',
          posted_at: new Date().toISOString(),
          review_note: 'Approved by Finance for client invoicing'
        })
        .eq('id', cost.id);
      if (error) throw error;
      refetch();
    } catch (err: any) {
      alert(err.message || 'Failed to post cost');
    } finally {
      setIsProcessing(false);
    }
  };

  // Reject / Mark Non-Recoverable
  const handleRejectCost = async (cost: CoreRecoverableCost) => {
    const note = prompt('Reason for marking this cost non-recoverable (internal firm overhead):');
    if (note === null) return;

    try {
      setIsProcessing(true);
      const { error } = await coreDb
        .from('recoverable_costs')
        .update({
          posting_status: 'NOT_RECOVERABLE',
          reviewed_by: getStoredUser()?.id,
          review_note: note || 'Marked as non-recoverable internal expense'
        })
        .eq('id', cost.id);
      if (error) throw error;
      refetch();
    } catch (err: any) {
      alert(err.message || 'Failed to update cost status');
    } finally {
      setIsProcessing(false);
    }
  };

  // Reverse cost
  const handleConfirmReversal = async () => {
    if (!reverseTarget) return;
    if (!reversalReason.trim()) {
      alert('Please enter a reason for the reversal');
      return;
    }

    try {
      setIsProcessing(true);
      const { error } = await coreDb
        .from('recoverable_costs')
        .update({
          posting_status: 'REVERSED',
          review_note: `Reversed: ${reversalReason}`
        })
        .eq('id', reverseTarget.id);

      if (error) throw error;
      setReverseTarget(null);
      setReversalReason('');
      refetch();
    } catch (err: any) {
      alert(err.message || 'Failed to reverse cost');
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
            Recoverable Client Disbursements
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Out-of-pocket costs, filing fees, courier charges, and claims to be billed to clients under Pure Agent rules
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition"
        >
          <PlusCircle className="w-4 h-4" />
          Add Direct Out-of-Pocket Cost
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Awaiting Finance Review</p>
          <p className="text-2xl font-bold text-amber-600 mt-2">{formatINR(pendingAmount)}</p>
          <p className="text-xs text-amber-600/70 mt-1">{pendingCount} disbursements pending approval</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-sky-600 uppercase tracking-wider">Posted & Ready to Invoice</p>
          <p className="text-2xl font-bold text-sky-600 mt-2">{formatINR(unbilledPostedAmount)}</p>
          <p className="text-xs text-sky-600/70 mt-1">Available in Ready to Invoice queue</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Total Billed & Recovered</p>
          <p className="text-2xl font-bold text-emerald-600 mt-2">{formatINR(recoveredAmount)}</p>
          <p className="text-xs text-emerald-600/70 mt-1">Linked to tax invoices</p>
        </div>
      </div>

      {/* Search & Tabs */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search description, matter, client, category..."
            className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto overflow-x-auto pb-1 sm:pb-0">
          {(['ALL', 'PENDING', 'POSTED', 'BILLED', 'REVERSED'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition whitespace-nowrap ${
                statusFilter === tab
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab === 'ALL' ? 'All Costs' :
               tab === 'PENDING' ? `Pending Review (${pendingCount})` :
               tab === 'POSTED' ? 'Posted (Unbilled)' :
               tab === 'BILLED' ? 'Invoiced' : 'Reversed / Rejected'}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Loading recoverable costs...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Receipt className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-slate-800">No disbursements found</h3>
            <p className="text-xs text-slate-400 mt-1">Disbursements logged across litigator, office or reimbursements will appear here</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/75 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">Date</th>
                  <th className="px-5 py-3.5">Project & Client</th>
                  <th className="px-5 py-3.5">Category</th>
                  <th className="px-5 py-3.5">Description</th>
                  <th className="px-5 py-3.5 text-right">Amount (₹)</th>
                  <th className="px-5 py-3.5 text-center">Source</th>
                  <th className="px-5 py-3.5 text-center">Status</th>
                  <th className="px-5 py-3.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filtered.map(cost => {
                  const isPending = cost.posting_status === 'PENDING_FINANCE';
                  const isPosted = cost.posting_status === 'AUTO_POSTED' && !cost.recovered_via_invoice_ref_id;
                  const isBilled = !!cost.recovered_via_invoice_ref_id;
                  const isReversed = cost.posting_status === 'REVERSED' || cost.posting_status === 'NOT_RECOVERABLE';

                  return (
                    <tr key={cost.id} className="hover:bg-slate-50/60 transition">
                      <td className="px-5 py-4 text-xs font-medium text-slate-600 whitespace-nowrap">
                        {formatDate(cost.cost_date)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-mono font-bold text-slate-900">{cost.project_code}</div>
                        <div className="text-xs text-slate-500">{cost.client_name}</div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-block px-2 py-0.5 text-xs font-semibold bg-slate-100 text-slate-700 rounded-md">
                          {cost.category}
                        </span>
                      </td>
                      <td className="px-5 py-4 max-w-sm">
                        <div className="font-medium text-slate-800">{cost.description}</div>
                        {cost.evidence_file_name && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-mono mt-0.5">
                            <FileText className="w-3 h-3" /> {cost.evidence_file_name}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right font-mono font-bold text-slate-900">
                        {formatINR(cost.amount)}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium font-mono">
                          {cost.source_type || cost.source_app}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        {isBilled ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                            <CheckCircle2 className="w-3 h-3" /> Invoiced
                          </span>
                        ) : isPosted ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800">
                            Posted
                          </span>
                        ) : isPending ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                            Pending Review
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                            {cost.posting_status}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {isPending && (
                            <>
                              <button
                                onClick={() => handlePostCost(cost)}
                                disabled={isProcessing}
                                className="px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition"
                                title="Approve & Post"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleRejectCost(cost)}
                                disabled={isProcessing}
                                className="px-2 py-1 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg transition"
                                title="Mark Non-Recoverable"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {isPosted && (
                            <button
                              onClick={() => setReverseTarget(cost)}
                              className="px-2.5 py-1 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                              title="Reverse Cost"
                            >
                              Reverse
                            </button>
                          )}
                          {isBilled && (
                            <span className="text-xs text-slate-400 font-mono">Billed</span>
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

      {/* Reversal Confirmation Modal */}
      {reverseTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-xl border border-slate-200 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Reverse Recoverable Cost</h3>
            <p className="text-xs text-slate-500 mb-4">
              Reversing {reverseTarget.description} ({formatINR(reverseTarget.amount)}) for {reverseTarget.project_code}
            </p>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Reversal Reason <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                value={reversalReason}
                onChange={(e) => setReversalReason(e.target.value)}
                placeholder="Explain why this cost is being reversed (e.g. client waiver, entered in error)..."
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setReverseTarget(null); setReversalReason(''); }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReversal}
                disabled={isProcessing || !reversalReason.trim()}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition disabled:opacity-50"
              >
                {isProcessing ? 'Reversing...' : 'Confirm Reversal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Direct Out of Pocket Cost Modal */}
      {showAddModal && (
        <NewDirectCostModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            refetch();
          }}
        />
      )}
    </div>
  );
}

// Sub-modal for adding direct recoverable disbursement
function NewDirectCostModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [projectCodeId, setProjectCodeId] = useState('');
  const [costDate, setCostDate] = useState(todayDateStr());
  const [category, setCategory] = useState('COURT_FEE');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [autoPost, setAutoPost] = useState(true);
  const [loading, setLoading] = useState(false);

  // Fetch project codes
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectCodeId || amount <= 0 || !description.trim()) return;

    const selectedProj = projectCodes.find(p => p.id === projectCodeId);
    const clientId = selectedProj?.client_id;

    try {
      setLoading(true);
      const postStatus = autoPost ? 'AUTO_POSTED' : 'PENDING_FINANCE';

      const { error } = await coreDb.from('recoverable_costs').insert({
        source_app: 'FINANCE',
        source_type: 'OFFICE_EXPENSE',
        project_code_id: projectCodeId,
        client_id: clientId,
        cost_date: costDate,
        category,
        description: description.trim(),
        amount,
        has_evidence: false,
        posting_status: postStatus,
        posted_at: autoPost ? new Date().toISOString() : null,
        created_by: getStoredUser()?.id
      });

      if (error) throw error;
      onSuccess();
    } catch (err: any) {
      alert(err.message || 'Failed to add cost');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-3xl shadow-xl border border-slate-200 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
        <h3 className="text-lg font-bold text-slate-900 mb-1">Add Out-of-Pocket Disbursement</h3>
        <p className="text-xs text-slate-500 mb-5">Record direct client expense for Pure Agent recovery</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Matter / Project Code *</label>
            <select
              value={projectCodeId}
              onChange={(e) => setProjectCodeId(e.target.value)}
              required
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">-- Select Project Code --</option>
              {projectCodes.map(p => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.title} ({p.clients?.client_name})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Amount (₹) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount || ''}
                onChange={(e) => setAmount(Number(e.target.value))}
                required
                className="w-full px-3 py-2 text-sm font-mono font-semibold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Disbursement Date *</label>
              <input
                type="date"
                value={costDate}
                onChange={(e) => setCostDate(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Expense Category *</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="COURT_FEE">Court Fee / Stamp Duty</option>
              <option value="GOVT_FEE">Official Registry / Patent Fee</option>
              <option value="COURIER_POSTAGE">Courier & Speed Post</option>
              <option value="PRINTING_BINDING">Printing, Plotting & Binding</option>
              <option value="TRAVEL">Advocate Travel / Conveyance</option>
              <option value="MISC_VENDOR">Vendor Search / Notary Charge</option>
              <option value="OFFICE_EXPENSE">Other Out-of-Pocket Expense</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Description *</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              placeholder="e.g. Courier speed post slip no. EM829103819IN to Controller of Patents"
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="autoPost"
              checked={autoPost}
              onChange={(e) => setAutoPost(e.target.checked)}
              className="w-4 h-4 text-emerald-600 rounded-md focus:ring-emerald-500"
            />
            <label htmlFor="autoPost" className="text-xs text-slate-700 font-medium cursor-pointer">
              Directly post to Unbilled Ledger (Skip pending review)
            </label>
          </div>

          <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition"
            >
              {loading ? 'Adding...' : 'Add Disbursement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
