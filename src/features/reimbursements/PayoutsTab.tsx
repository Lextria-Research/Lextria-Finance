// src/features/reimbursements/PayoutsTab.tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, DollarSign, Send, ArrowRight, ShieldCheck } from 'lucide-react';
import { financeDb, coreDb } from '../../lib/supabase';
import { formatINR } from '../../lib/currency';
import { formatDate, todayDateStr } from '../../lib/clock';
import { getStoredUser } from '../../lib/auth';
import type { ReimbursementClaim, ReimbursementPayout } from '../../lib/types';

export default function PayoutsTab({ onRefresh }: { onRefresh: () => void }) {
  const [selectedClaimIds, setSelectedClaimIds] = useState<string[]>([]);
  const [payoutDate, setPayoutDate] = useState(todayDateStr());
  const [method, setMethod] = useState<'BANK_TRANSFER' | 'UPI'>('BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Fetch claims in FINANCE_APPROVED status ready for payout
  const { data: approvedClaims = [], isLoading, refetch } = useQuery({
    queryKey: ['approved-claims-payout'],
    queryFn: async () => {
      const { data, error } = await financeDb
        .from('reimbursement_claims_view')
        .select('*')
        .eq('status', 'FINANCE_APPROVED')
        .order('expense_date', { ascending: true });
      if (error) throw error;
      return (data || []) as ReimbursementClaim[];
    }
  });

  // Fetch previous payout batches
  const { data: pastPayouts = [] } = useQuery({
    queryKey: ['past-payouts-history'],
    queryFn: async () => {
      const { data, error } = await financeDb
        .from('reimbursement_payouts')
        .select('*')
        .order('payout_date', { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data || []) as ReimbursementPayout[];
    }
  });

  const selectedTotal = approvedClaims
    .filter(c => selectedClaimIds.includes(c.id))
    .reduce((s, c) => s + Number(c.amount || 0), 0);

  const toggleSelectAll = () => {
    if (selectedClaimIds.length === approvedClaims.length) {
      setSelectedClaimIds([]);
    } else {
      setSelectedClaimIds(approvedClaims.map(c => c.id));
    }
  };

  const handleExecutePayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedClaimIds.length === 0 || selectedTotal <= 0) {
      alert('Please select at least one claim to payout');
      return;
    }
    if (!reference.trim()) {
      alert('Bank transfer or UPI UTR reference is mandatory for payout records');
      return;
    }

    try {
      setIsProcessing(true);
      const user = getStoredUser();

      // 1. Create reimbursement payout batch
      const { data: batch, error: batchErr } = await financeDb
        .from('reimbursement_payouts')
        .insert({
          payout_date: payoutDate,
          method,
          reference: reference.trim(),
          total: selectedTotal,
          paid_by: user?.id,
          created_by: user?.id
        })
        .select('id')
        .single();

      if (batchErr) throw batchErr;

      // 2. Update claims to PAID and set payout_id
      const { error: claimsErr } = await financeDb
        .from('reimbursement_claims')
        .update({
          status: 'PAID',
          payout_id: batch.id
        })
        .in('id', selectedClaimIds);

      if (claimsErr) throw claimsErr;

      setSelectedClaimIds([]);
      setReference('');
      refetch();
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to process payout batch');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-emerald-950">Friday Reimbursement Payout Batch Processing</h3>
          <p className="text-xs text-emerald-800 mt-0.5">
            Group verified claims, generate bank disbursement transfer schedule, and update status to PAID
          </p>
        </div>
        <div className="text-right">
          <span className="text-xs text-emerald-700 block">Pending Payout Batch Amount</span>
          <span className="text-xl font-bold font-mono text-emerald-900">
            {formatINR(approvedClaims.reduce((s, c) => s + Number(c.amount || 0), 0))}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Claims Table to Select */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Claims Awaiting Payout ({approvedClaims.length})
            </h4>
            {approvedClaims.length > 0 && (
              <button
                type="button"
                onClick={toggleSelectAll}
                className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
              >
                {selectedClaimIds.length === approvedClaims.length ? 'Deselect All' : 'Select All Claims'}
              </button>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {isLoading ? (
              <div className="p-8 text-center text-xs text-slate-400">Loading claims...</div>
            ) : approvedClaims.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No approved claims awaiting disbursement at this time.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-500 uppercase">
                    <tr>
                      <th className="px-4 py-3 w-8"></th>
                      <th className="px-4 py-3">Claimant</th>
                      <th className="px-4 py-3">Expense</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3 text-right">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {approvedClaims.map(c => {
                      const isSelected = selectedClaimIds.includes(c.id);

                      return (
                        <tr
                          key={c.id}
                          onClick={() => {
                            setSelectedClaimIds(prev =>
                              isSelected ? prev.filter(x => x !== c.id) : [...prev, c.id]
                            );
                          }}
                          className={`hover:bg-slate-50 cursor-pointer transition ${isSelected ? 'bg-emerald-50/50' : ''}`}
                        >
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="w-4 h-4 text-emerald-600 rounded-md"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-900">{c.claimant_name}</div>
                            <div className="text-[11px] text-slate-400">{c.claimant_department || 'Staff'}</div>
                          </td>
                          <td className="px-4 py-3 max-w-xs">
                            <div className="truncate font-medium text-slate-800">{c.description}</div>
                            <div className="text-[11px] text-slate-400">{formatDate(c.expense_date)}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium">
                              {c.category}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                            {formatINR(c.amount)}
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

        {/* Payout Processing Card */}
        <div className="space-y-4">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Execute Disbursement</h4>
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            <form onSubmit={handleExecutePayout} className="space-y-4">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-xs text-slate-500 block">Selected Payout Total</span>
                <span className="text-2xl font-bold font-mono text-emerald-600 mt-1 block">
                  {formatINR(selectedTotal)}
                </span>
                <span className="text-[11px] text-slate-400 mt-0.5 block">
                  {selectedClaimIds.length} claim{selectedClaimIds.length === 1 ? '' : 's'} included
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Disbursement Date *</label>
                <input
                  type="date"
                  value={payoutDate}
                  onChange={(e) => setPayoutDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Disbursement Method *</label>
                <select
                  value={method}
                  onChange={(e: any) => setMethod(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="BANK_TRANSFER">Bank NEFT / IMPS Batch Transfer</option>
                  <option value="UPI">Corporate UPI Transfer</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Bank UTR / Transaction Reference # *
                </label>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  required
                  placeholder="e.g. UTR-20261007-928190"
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <button
                type="submit"
                disabled={isProcessing || selectedClaimIds.length === 0}
                className="w-full py-2.5 px-4 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <ShieldCheck className="w-4 h-4" />
                {isProcessing ? 'Processing Payout...' : 'Disburse & Mark Claims Paid'}
              </button>
            </form>
          </div>

          {/* Past Payout Batches */}
          {pastPayouts.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
              <h5 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Recent Payout Batches</h5>
              <div className="divide-y divide-slate-100 text-xs">
                {pastPayouts.slice(0, 4).map(p => (
                  <div key={p.id} className="py-2 flex justify-between items-center">
                    <div>
                      <div className="font-mono text-slate-800">{p.reference || 'Disbursement'}</div>
                      <div className="text-[10px] text-slate-400">{formatDate(p.payout_date)} • {p.method}</div>
                    </div>
                    <div className="font-mono font-semibold text-emerald-700">{formatINR(p.total)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
