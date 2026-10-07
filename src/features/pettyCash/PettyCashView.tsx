// src/features/pettyCash/PettyCashView.tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Coins, PlusCircle, CheckCircle2, Clock, XCircle, 
  AlertCircle, ShieldCheck, FileCheck, ArrowRight, UserCheck
} from 'lucide-react';
import { coreDb } from '../../lib/supabase';
import { formatINR } from '../../lib/currency';
import { formatDate } from '../../lib/clock';
import { useAuth } from '../../lib/auth';
import type { CorePettyCashTopup, CorePettyCashCount } from '../../lib/types';

export default function PettyCashView() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'TOPUPS' | 'COUNTS'>('TOPUPS');
  const [signoffModalCount, setSignoffModalCount] = useState<CorePettyCashCount | null>(null);
  const [signoffNote, setSignoffNote] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Fetch top-up requests from core.petty_cash_topups
  const { data: topups = [], isLoading: loadingTopups, refetch: refetchTopups } = useQuery({
    queryKey: ['core-petty-cash-topups'],
    queryFn: async () => {
      const { data, error } = await coreDb
        .from('petty_cash_topups')
        .select('*')
        .order('requested_at', { ascending: false });
      if (error) throw error;
      return (data || []) as CorePettyCashTopup[];
    }
  });

  // Fetch physical cash counts from core.petty_cash_counts
  const { data: counts = [], isLoading: loadingCounts, refetch: refetchCounts } = useQuery({
    queryKey: ['core-petty-cash-counts'],
    queryFn: async () => {
      const { data, error } = await coreDb
        .from('petty_cash_counts')
        .select('*')
        .order('count_date', { ascending: false });
      if (error) throw error;
      return (data || []) as CorePettyCashCount[];
    }
  });

  // Finance decision on topup (Approve / Reject)
  const handleTopupDecision = async (topupId: string, status: 'APPROVED' | 'REJECTED') => {
    const note = prompt(`Enter ${status.toLowerCase()} note / remarks:`);
    if (note === null) return;

    try {
      setIsProcessing(true);
      const { error } = await coreDb
        .from('petty_cash_topups')
        .update({
          status,
          decided_by: user?.id,
          decided_at: new Date().toISOString(),
          decision_note: note || null
        })
        .eq('id', topupId);
      if (error) throw error;
      refetchTopups();
    } catch (err: any) {
      alert(err.message || 'Failed to update topup status');
    } finally {
      setIsProcessing(false);
    }
  };

  // Finance marks cash handed over
  const handleHandedOver = async (topupId: string) => {
    try {
      setIsProcessing(true);
      const { error } = await coreDb
        .from('petty_cash_topups')
        .update({
          status: 'HANDED_OVER',
          handed_over_at: new Date().toISOString()
        })
        .eq('id', topupId);
      if (error) throw error;
      refetchTopups();
    } catch (err: any) {
      alert(err.message || 'Failed to update status');
    } finally {
      setIsProcessing(false);
    }
  };

  // Finance signs off physical count
  const handleSignoffCount = async () => {
    if (!signoffModalCount) return;

    try {
      setIsProcessing(true);
      const { error } = await coreDb
        .from('petty_cash_counts')
        .update({
          finance_signoff_by: user?.id,
          finance_signoff_at: new Date().toISOString(),
          finance_note: signoffNote.trim() || null
        })
        .eq('id', signoffModalCount.id);
      if (error) throw error;

      setSignoffModalCount(null);
      setSignoffNote('');
      refetchCounts();
    } catch (err: any) {
      alert(err.message || 'Failed to signoff count');
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
              <Coins className="w-6 h-6" />
            </div>
            Petty Cash & Float Oversight
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Office executive cash float replenishment requests and weekly physical cash audit signoffs
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('TOPUPS')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'TOPUPS'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Coins className="w-4 h-4" />
          Top-up Requisitions ({topups.length})
        </button>
        <button
          onClick={() => setActiveTab('COUNTS')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'COUNTS'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          Physical Cash Audits ({counts.length})
        </button>
      </div>

      {activeTab === 'TOPUPS' ? (
        /* Top-ups table */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {loadingTopups ? (
            <div className="p-12 text-center text-slate-400 text-sm">Loading requisitions...</div>
          ) : topups.length === 0 ? (
            <div className="p-12 text-center">
              <Coins className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-slate-800">No petty cash top-up requests</h3>
              <p className="text-xs text-slate-400 mt-1">Requests submitted by office administrators will appear here</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50/75 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3.5">Requested At</th>
                    <th className="px-5 py-3.5 text-right">Amount (₹)</th>
                    <th className="px-5 py-3.5">Reason / Purpose</th>
                    <th className="px-5 py-3.5 text-center">Status</th>
                    <th className="px-5 py-3.5">Decision Note</th>
                    <th className="px-5 py-3.5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {topups.map(t => (
                    <tr key={t.id} className="hover:bg-slate-50/60 transition">
                      <td className="px-5 py-4 text-xs font-medium text-slate-600 whitespace-nowrap">
                        {formatDate(t.requested_at)}
                      </td>
                      <td className="px-5 py-4 text-right font-mono font-bold text-slate-900">
                        {formatINR(t.amount)}
                      </td>
                      <td className="px-5 py-4 max-w-sm text-slate-800">
                        {t.reason}
                      </td>
                      <td className="px-5 py-4 text-center">
                        {t.status === 'HANDED_OVER' ? (
                          <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
                            <CheckCircle2 className="w-3 h-3" /> Handed Over
                          </span>
                        ) : t.status === 'APPROVED' ? (
                          <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-800 font-semibold">
                            Approved
                          </span>
                        ) : t.status === 'REQUESTED' ? (
                          <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">
                            <Clock className="w-3 h-3" /> Requested
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 font-semibold">
                            <XCircle className="w-3 h-3" /> Rejected
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-500">
                        {t.decision_note || '—'}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {t.status === 'REQUESTED' && (
                            <>
                              <button
                                onClick={() => handleTopupDecision(t.id, 'APPROVED')}
                                disabled={isProcessing}
                                className="px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleTopupDecision(t.id, 'REJECTED')}
                                disabled={isProcessing}
                                className="px-2 py-1 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg transition"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {t.status === 'APPROVED' && (
                            <button
                              onClick={() => handleHandedOver(t.id)}
                              disabled={isProcessing}
                              className="px-2.5 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition"
                            >
                              Mark Handed Over
                            </button>
                          )}
                          {t.status === 'HANDED_OVER' && (
                            <span className="text-xs text-slate-400 font-mono">Completed</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* Physical Cash Counts Table */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {loadingCounts ? (
            <div className="p-12 text-center text-slate-400 text-sm">Loading cash audits...</div>
          ) : counts.length === 0 ? (
            <div className="p-12 text-center">
              <ShieldCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-slate-800">No physical cash count audits found</h3>
              <p className="text-xs text-slate-400 mt-1">Audit logs submitted by office administrators will appear here</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50/75 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3.5">Count Date</th>
                    <th className="px-5 py-3.5 text-right">Physical Cash (₹)</th>
                    <th className="px-5 py-3.5 text-right">Book Balance (₹)</th>
                    <th className="px-5 py-3.5 text-right">Variance (₹)</th>
                    <th className="px-5 py-3.5">Audit Note</th>
                    <th className="px-5 py-3.5 text-center">Finance Signoff</th>
                    <th className="px-5 py-3.5 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {counts.map(c => {
                    const variance = Number(c.variance || 0);
                    const isSigned = !!c.finance_signoff_by;

                    return (
                      <tr key={c.id} className="hover:bg-slate-50/60 transition">
                        <td className="px-5 py-4 text-xs font-medium text-slate-600 whitespace-nowrap">
                          {formatDate(c.count_date)}
                        </td>
                        <td className="px-5 py-4 text-right font-mono font-bold text-slate-900">
                          {formatINR(c.physical_cash)}
                        </td>
                        <td className="px-5 py-4 text-right font-mono text-slate-600">
                          {formatINR(c.book_balance)}
                        </td>
                        <td className="px-5 py-4 text-right font-mono font-bold">
                          {variance === 0 ? (
                            <span className="text-emerald-600">₹0.00 (Balanced)</span>
                          ) : variance > 0 ? (
                            <span className="text-sky-600">+{formatINR(variance)} (Surplus)</span>
                          ) : (
                            <span className="text-rose-600">{formatINR(variance)} (Deficit)</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-xs text-slate-500 max-w-xs">
                          {c.note || '—'}
                        </td>
                        <td className="px-5 py-4 text-center">
                          {isSigned ? (
                            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
                              <CheckCircle2 className="w-3 h-3" /> Signed Off
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">
                              Pending Signoff
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-center">
                          {!isSigned ? (
                            <button
                              onClick={() => setSignoffModalCount(c)}
                              className="px-2.5 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition"
                            >
                              Sign Off
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400 font-mono">
                              {c.finance_signoff_at ? formatDate(c.finance_signoff_at) : 'Signed'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Signoff Count Modal */}
      {signoffModalCount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-xl border border-slate-200 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Sign Off Physical Cash Count</h3>
            <p className="text-xs text-slate-500 mb-4">
              Confirming audit for {formatDate(signoffModalCount.count_date)}: Physical {formatINR(signoffModalCount.physical_cash)}, Book {formatINR(signoffModalCount.book_balance)}
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Finance Signoff Note / Variance Explanation
                </label>
                <textarea
                  rows={3}
                  value={signoffNote}
                  onChange={(e) => setSignoffNote(e.target.value)}
                  placeholder="Audit verification remarks..."
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSignoffModalCount(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSignoffCount}
                  disabled={isProcessing}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition"
                >
                  Confirm Signoff
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
