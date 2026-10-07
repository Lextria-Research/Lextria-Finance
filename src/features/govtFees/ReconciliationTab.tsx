// src/features/govtFees/ReconciliationTab.tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PlusCircle, Search, CheckCircle2, AlertCircle, Link as LinkIcon, RefreshCw } from 'lucide-react';
import { financeDb, coreDb } from '../../lib/supabase';
import { formatINR } from '../../lib/currency';
import { formatDate, todayDateStr } from '../../lib/clock';
import { getStoredUser } from '../../lib/auth';
import type { PortalPaymentRecord, GovtFeeRequest } from '../../lib/types';

export default function ReconciliationTab() {
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [matchingRecord, setMatchingRecord] = useState<PortalPaymentRecord | null>(null);

  // Fetch portal payment records
  const { data: records = [], isLoading, refetch } = useQuery({
    queryKey: ['portal-payment-records'],
    queryFn: async () => {
      const { data, error } = await financeDb
        .from('portal_payment_records')
        .select('*')
        .order('payment_date', { ascending: false });
      if (error) throw error;
      return (data || []) as PortalPaymentRecord[];
    }
  });

  // Fetch open PAID govt fee requests available for reconciliation
  const { data: openPaidRequests = [], refetch: refetchRequests } = useQuery({
    queryKey: ['paid-govt-fee-requests'],
    queryFn: async () => {
      const { data, error } = await financeDb
        .from('govt_fee_requests_view')
        .select('*')
        .eq('status', 'PAID')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as GovtFeeRequest[];
    }
  });

  const filtered = records.filter(r => {
    const q = search.toLowerCase();
    return (
      r.office.toLowerCase().includes(q) ||
      r.reference.toLowerCase().includes(q) ||
      (r.identifier && r.identifier.toLowerCase().includes(q))
    );
  });

  const unmatchedCount = records.filter(r => r.match_status === 'UNMATCHED').length;

  const handleMatch = async (recordId: string, requestId: string) => {
    try {
      // 1. Update portal payment record to MATCHED
      const { error: err1 } = await financeDb
        .from('portal_payment_records')
        .update({
          match_status: 'MATCHED',
          matched_request_id: requestId
        })
        .eq('id', recordId);
      if (err1) throw err1;

      // 2. Update govt fee request to RECONCILED
      const { error: err2 } = await financeDb
        .from('govt_fee_requests')
        .update({
          status: 'RECONCILED'
        })
        .eq('id', requestId);
      if (err2) throw err2;

      setMatchingRecord(null);
      refetch();
      refetchRequests();
    } catch (err: any) {
      alert(err.message || 'Failed to match record');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-slate-900">IP Portal Bank Remittance Reconciliation</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Cross-match official e-filing debits against internal payment requests to identify unmatched challans
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition"
        >
          <PlusCircle className="w-4 h-4" />
          Log Portal Statement Entry
        </button>
      </div>

      {/* KPI banner */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between text-xs">
        <div>
          <span className="text-slate-500">Unmatched Portal Transactions:</span>
          <span className="font-bold text-amber-600 ml-2 font-mono text-sm">{unmatchedCount} entries</span>
        </div>
        <div>
          <span className="text-slate-500">Awaiting Reconciliation in Fee Queue:</span>
          <span className="font-bold text-slate-800 ml-2 font-mono text-sm">{openPaidRequests.length} requests</span>
        </div>
      </div>

      {/* Search */}
      <div className="relative w-full sm:w-80">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by challan ref, office, CBR..."
          className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Loading portal entries...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            No portal payment entries logged yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/75 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">Date</th>
                  <th className="px-5 py-3.5">Office / Registry</th>
                  <th className="px-5 py-3.5">Challan / UTR Ref</th>
                  <th className="px-5 py-3.5">CBR / App Identifier</th>
                  <th className="px-5 py-3.5 text-right">Debit (₹)</th>
                  <th className="px-5 py-3.5 text-center">Status</th>
                  <th className="px-5 py-3.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filtered.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50/60 transition">
                    <td className="px-5 py-4 text-xs font-medium text-slate-600 whitespace-nowrap">
                      {formatDate(r.payment_date)}
                    </td>
                    <td className="px-5 py-4 font-semibold text-slate-900">{r.office}</td>
                    <td className="px-5 py-4 font-mono text-xs text-slate-800">{r.reference}</td>
                    <td className="px-5 py-4 font-mono text-xs text-slate-500">{r.identifier || '—'}</td>
                    <td className="px-5 py-4 text-right font-mono font-bold text-slate-900">{formatINR(r.amount)}</td>
                    <td className="px-5 py-4 text-center">
                      {r.match_status === 'MATCHED' ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
                          <CheckCircle2 className="w-3 h-3" /> Matched
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">
                          <AlertCircle className="w-3 h-3" /> Unmatched
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-center">
                      {r.match_status === 'UNMATCHED' && (
                        <button
                          onClick={() => setMatchingRecord(r)}
                          className="px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition"
                        >
                          Match Request
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Match Picker Modal */}
      {matchingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-xl border border-slate-200 max-w-lg w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Reconcile Portal Payment</h3>
            <p className="text-xs text-slate-500 mb-4">
              Select matching fee request for Challan <strong className="font-mono text-slate-800">{matchingRecord.reference}</strong> ({formatINR(matchingRecord.amount)})
            </p>

            <div className="space-y-2 max-h-72 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 p-2">
              {openPaidRequests.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">No open PAID fee requests found</p>
              ) : (
                openPaidRequests.map(req => (
                  <div key={req.id} className="p-2.5 flex items-center justify-between text-xs hover:bg-slate-50 rounded-lg">
                    <div>
                      <div className="font-semibold text-slate-900">{req.form} • {req.project_code}</div>
                      <div className="text-slate-400 font-mono text-[11px]">{req.client_name} • Ref: {req.transaction_reference || 'N/A'}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-slate-900">{formatINR(req.amount)}</span>
                      <button
                        onClick={() => handleMatch(matchingRecord.id, req.id)}
                        className="px-2.5 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
                      >
                        Link
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-4 flex justify-end">
              <button
                onClick={() => setMatchingRecord(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Portal Entry Modal */}
      {showAddModal && (
        <NewPortalRecordModal
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

function NewPortalRecordModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [date, setDate] = useState(todayDateStr());
  const [office, setOffice] = useState('Patent Office (IPO E-Filing)');
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [identifier, setIdentifier] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reference.trim() || amount <= 0) return;

    try {
      setLoading(true);
      const user = getStoredUser();

      const { error } = await financeDb.from('portal_payment_records').insert({
        payment_date: date,
        office,
        reference: reference.trim(),
        amount,
        identifier: identifier.trim() || null,
        entered_by: user?.id,
        match_status: 'UNMATCHED'
      });

      if (error) throw error;
      onSuccess();
    } catch (err: any) {
      alert(err.message || 'Failed to save portal record');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-3xl shadow-xl border border-slate-200 max-w-md w-full p-6">
        <h3 className="text-lg font-bold text-slate-900 mb-1">Log Portal Payment Record</h3>
        <p className="text-xs text-slate-500 mb-4">Record debit transaction from bank or registry portal statement</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Date *</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Debit Amount (₹) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount || ''}
                onChange={(e) => setAmount(Number(e.target.value))}
                required
                className="w-full px-3 py-2 text-sm font-mono font-bold bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Office / Portal *</label>
            <input
              type="text"
              value={office}
              onChange={(e) => setOffice(e.target.value)}
              required
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Challan / UTR Reference # *</label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              required
              placeholder="e.g. IPO-CH-2026-928192"
              className="w-full px-3 py-2 text-sm font-mono bg-slate-50 border border-slate-200 rounded-xl"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">CBR No / Application Identifier</label>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="e.g. CBR-82910, Application 202621008291"
              className="w-full px-3 py-2 text-sm font-mono bg-slate-50 border border-slate-200 rounded-xl"
            />
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
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl"
            >
              {loading ? 'Saving...' : 'Save Portal Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
