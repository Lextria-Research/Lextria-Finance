// src/features/govtFees/GovtFeesView.tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Landmark, Search, PlusCircle, CheckCircle2, Clock, 
  AlertCircle, CheckSquare, XCircle, FileText, ArrowRight 
} from 'lucide-react';
import { financeDb, coreDb } from '../../lib/supabase';
import { formatINR } from '../../lib/currency';
import { formatDate } from '../../lib/clock';
import { getStoredUser } from '../../lib/auth';
import NewGovtFeeModal from './NewGovtFeeModal';
import ReconciliationTab from './ReconciliationTab';
import type { GovtFeeRequest } from '../../lib/types';

export default function GovtFeesView() {
  const [activeTab, setActiveTab] = useState<'REQUESTS' | 'RECONCILIATION'>('REQUESTS');
  const [search, setSearch] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [payingRequest, setPayingRequest] = useState<GovtFeeRequest | null>(null);
  const [txReference, setTxReference] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Fetch govt fee requests from view
  const { data: requests = [], isLoading, refetch } = useQuery({
    queryKey: ['govt-fee-requests-view'],
    queryFn: async () => {
      const { data, error } = await financeDb
        .from('govt_fee_requests_view')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as GovtFeeRequest[];
    }
  });

  const filtered = requests.filter(r => {
    const q = search.toLowerCase();
    return (
      r.form.toLowerCase().includes(q) ||
      r.project_code?.toLowerCase().includes(q) ||
      r.client_name?.toLowerCase().includes(q) ||
      r.applicant_fee_category.toLowerCase().includes(q) ||
      (r.transaction_reference && r.transaction_reference.toLowerCase().includes(q))
    );
  });

  const requestedCount = requests.filter(r => r.status === 'REQUESTED').length;
  const approvedCount = requests.filter(r => r.status === 'APPROVED').length;
  const totalPaidAmount = requests.filter(r => r.status === 'PAID' || r.status === 'RECONCILED').reduce((s, r) => s + Number(r.amount || 0), 0);

  // Approve request
  const handleApprove = async (id: string) => {
    try {
      setIsProcessing(true);
      const user = getStoredUser();
      const { error } = await financeDb
        .from('govt_fee_requests')
        .update({
          status: 'APPROVED',
          approved_by: user?.id,
          approved_at: new Date().toISOString()
        })
        .eq('id', id);
      if (error) throw error;
      refetch();
    } catch (err: any) {
      alert(err.message || 'Failed to approve request');
    } finally {
      setIsProcessing(false);
    }
  };

  // Reject request
  const handleReject = async (id: string) => {
    const reason = prompt('Reason for rejection:');
    if (reason === null) return;

    try {
      setIsProcessing(true);
      const user = getStoredUser();
      const { error } = await financeDb
        .from('govt_fee_requests')
        .update({
          status: 'REJECTED',
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
          adjustment_reason: reason || 'Rejected by Finance'
        })
        .eq('id', id);
      if (error) throw error;
      refetch();
    } catch (err: any) {
      alert(err.message || 'Failed to reject request');
    } finally {
      setIsProcessing(false);
    }
  };

  // Mark Paid with Challan Ref (calls stored procedure)
  const handleConfirmPaid = async () => {
    if (!payingRequest || !txReference.trim()) return;

    try {
      setIsProcessing(true);
      const { error } = await financeDb.rpc('mark_govt_fee_paid', {
        p_request_id: payingRequest.id,
        p_transaction_reference: txReference.trim()
      });

      if (error) throw error;
      setPayingRequest(null);
      setTxReference('');
      refetch();
    } catch (err: any) {
      alert(err.message || 'Failed to mark as paid');
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
              <Landmark className="w-6 h-6" />
            </div>
            Official Govt & Registry Fees
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            IPO e-filing fee requisitions, approvals, payment challan tracking, and auto-disbursement recovery
          </p>
        </div>

        <button
          onClick={() => setShowNewModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition"
        >
          <PlusCircle className="w-4 h-4" />
          Request Govt Fee
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Awaiting Approval</p>
          <p className="text-2xl font-bold text-amber-600 mt-2">{requestedCount} requests</p>
          <p className="text-xs text-amber-600/70 mt-1">Need Finance verification</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-sky-600 uppercase tracking-wider">Approved (Ready to File)</p>
          <p className="text-2xl font-bold text-sky-600 mt-2">{approvedCount} requests</p>
          <p className="text-xs text-sky-600/70 mt-1">Ready for registry portal payment</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Total Paid Official Fees</p>
          <p className="text-2xl font-bold text-emerald-600 mt-2">{formatINR(totalPaidAmount)}</p>
          <p className="text-xs text-emerald-600/70 mt-1">Auto-posted to Recoverable Costs</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('REQUESTS')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'REQUESTS'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Landmark className="w-4 h-4" />
          Fee Requests Queue ({requests.length})
        </button>
        <button
          onClick={() => setActiveTab('RECONCILIATION')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'RECONCILIATION'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <CheckSquare className="w-4 h-4" />
          Portal Statement Reconciliation
        </button>
      </div>

      {activeTab === 'RECONCILIATION' ? (
        <ReconciliationTab />
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
                placeholder="Search matter, form, category, challan..."
                className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {isLoading ? (
              <div className="p-12 text-center text-slate-400 text-sm">Loading fee requests...</div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center">
                <Landmark className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-slate-800">No govt fee requests found</h3>
                <p className="text-xs text-slate-400 mt-1">Submit a fee requisition for IPO or court filing</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50/75 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-5 py-3.5">Requested</th>
                      <th className="px-5 py-3.5">Matter & Client</th>
                      <th className="px-5 py-3.5">Form / Action</th>
                      <th className="px-5 py-3.5">Category</th>
                      <th className="px-5 py-3.5 text-right">Amount (₹)</th>
                      <th className="px-5 py-3.5">Challan Ref</th>
                      <th className="px-5 py-3.5 text-center">Status</th>
                      <th className="px-5 py-3.5 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filtered.map(req => {
                      const isRequested = req.status === 'REQUESTED';
                      const isApproved = req.status === 'APPROVED';
                      const isPaid = req.status === 'PAID' || req.status === 'RECONCILED';

                      return (
                        <tr key={req.id} className="hover:bg-slate-50/60 transition">
                          <td className="px-5 py-4 text-xs font-medium text-slate-600 whitespace-nowrap">
                            {formatDate(req.created_at)}
                          </td>
                          <td className="px-5 py-4">
                            <div className="font-mono font-bold text-slate-900">{req.project_code}</div>
                            <div className="text-xs text-slate-500">{req.client_name}</div>
                          </td>
                          <td className="px-5 py-4 font-semibold text-slate-800">
                            {req.form}
                          </td>
                          <td className="px-5 py-4 text-xs text-slate-600">
                            {req.applicant_fee_category}
                          </td>
                          <td className="px-5 py-4 text-right font-mono font-bold text-slate-900">
                            {formatINR(req.amount)}
                          </td>
                          <td className="px-5 py-4 font-mono text-xs text-slate-600">
                            {req.transaction_reference || '—'}
                          </td>
                          <td className="px-5 py-4 text-center">
                            {req.status === 'RECONCILED' ? (
                              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
                                <CheckCircle2 className="w-3 h-3" /> Reconciled
                              </span>
                            ) : req.status === 'PAID' ? (
                              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3" /> Paid
                              </span>
                            ) : req.status === 'APPROVED' ? (
                              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-800 font-semibold">
                                <Clock className="w-3 h-3" /> Approved
                              </span>
                            ) : req.status === 'REQUESTED' ? (
                              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">
                                <AlertCircle className="w-3 h-3" /> Requested
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 font-semibold">
                                <XCircle className="w-3 h-3" /> Rejected
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {isRequested && (
                                <>
                                  <button
                                    onClick={() => handleApprove(req.id)}
                                    disabled={isProcessing}
                                    className="px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => handleReject(req.id)}
                                    disabled={isProcessing}
                                    className="px-2 py-1 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg transition"
                                  >
                                    Reject
                                  </button>
                                </>
                              )}
                              {isApproved && (
                                <button
                                  onClick={() => setPayingRequest(req)}
                                  className="px-3 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition flex items-center gap-1"
                                >
                                  Mark Paid
                                </button>
                              )}
                              {isPaid && (
                                <span className="text-xs text-slate-400 font-mono">Disbursed</span>
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

      {/* Mark Paid Modal */}
      {payingRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-xl border border-slate-200 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Confirm Official Fee Payment</h3>
            <p className="text-xs text-slate-500 mb-4">
              Marking {payingRequest.form} ({formatINR(payingRequest.amount)}) on matter {payingRequest.project_code} as PAID
            </p>

            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-800 mb-4">
              This will automatically post a recoverable disbursement to the client's matter ledger.
            </div>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Official Challan / Payment Reference # <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={txReference}
                onChange={(e) => setTxReference(e.target.value)}
                required
                placeholder="e.g. IPO-CH-2026-928192, Bank UTR..."
                className="w-full px-3.5 py-2 text-sm font-mono bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setPayingRequest(null); setTxReference(''); }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPaid}
                disabled={isProcessing || !txReference.trim()}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition disabled:opacity-50"
              >
                {isProcessing ? 'Recording...' : 'Confirm & Post Disbursement'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Request Modal */}
      {showNewModal && (
        <NewGovtFeeModal
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
