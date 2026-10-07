// src/features/reimbursements/NewClaimModal.tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Receipt, AlertTriangle, UploadCloud, Plus, Trash2 } from 'lucide-react';
import { financeDb, coreDb } from '../../lib/supabase';
import { formatINR } from '../../lib/currency';
import { todayDateStr } from '../../lib/clock';
import { getStoredUser } from '../../lib/auth';
import type { CoreProjectCode } from '../../lib/types';

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

export default function NewClaimModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [expenseDate, setExpenseDate] = useState(todayDateStr());
  const [category, setCategory] = useState<'FUEL' | 'PURCHASE' | 'TRAVEL' | 'FOOD' | 'POSTAGE_COURIER' | 'FEE_PAID_PERSONALLY' | 'OTHER'>('TRAVEL');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [paidWith, setPaidWith] = useState<'OWN_CASH' | 'OWN_UPI' | 'OWN_CARD'>('OWN_UPI');
  
  // Bill / receipt override
  const [hasReceipt, setHasReceipt] = useState(true);
  const [billOverrideReason, setBillOverrideReason] = useState('');

  // Project code allocations
  const [allocations, setAllocations] = useState<{ project_code_id: string; amount: number }[]>([]);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

  // 60-day window check
  const isOlderThan60Days = (() => {
    if (!expenseDate) return false;
    const exp = new Date(expenseDate);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - exp.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays > 60;
  })();

  const handleAddAllocation = () => {
    if (projectCodes.length > 0) {
      setAllocations(prev => [...prev, { project_code_id: projectCodes[0].id, amount: 0 }]);
    }
  };

  const handleRemoveAllocation = (index: number) => {
    setAllocations(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (amount <= 0 || !description.trim()) {
      setErrorMsg('Please enter a valid amount and description');
      return;
    }

    if (!hasReceipt && !billOverrideReason.trim()) {
      setErrorMsg('A valid justification is required when submitting a claim without a receipt');
      return;
    }

    try {
      setLoading(true);
      const user = getStoredUser();

      // Get user's manager from core.profiles
      const { data: profile } = await coreDb
        .from('profiles')
        .select('manager_id')
        .eq('id', user?.id)
        .single();

      // Insert claim
      const { data: newClaim, error: claimErr } = await financeDb
        .from('reimbursement_claims')
        .insert({
          claimant_id: user?.id,
          expense_date: expenseDate,
          category,
          description: description.trim(),
          amount,
          paid_with: paidWith,
          bill_override_reason: !hasReceipt ? billOverrideReason.trim() : null,
          status: 'SUBMITTED',
          manager_id: profile?.manager_id || null,
          created_by: user?.id
        })
        .select('id')
        .single();

      if (claimErr) throw claimErr;

      // If user uploaded a bill metadata record
      if (hasReceipt) {
        await financeDb.from('reimbursement_bills').insert({
          claim_id: newClaim.id,
          bill_number: 'RECEIPT-ATTACHED',
          bill_date: expenseDate,
          vendor_name: 'Direct Expense',
          amount,
          created_by: user?.id
        });
      }

      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit reimbursement claim');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-3xl shadow-xl border border-slate-200 max-w-lg w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Submit Reimbursement Claim</h3>
              <p className="text-xs text-slate-500">Log employee out-of-pocket expenses for manager approval</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-xs text-rose-700 rounded-xl">
              {errorMsg}
            </div>
          )}

          {/* 60 day warning */}
          {isOlderThan60Days && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong>Policy Warning: Expense is older than 60 days</strong>
                <p className="mt-0.5 text-amber-700">
                  Per firm policy, expenses must be submitted within 60 days. Special finance authorization will be required.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Expense Date *</label>
              <input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Expense Category *</label>
              <select
                value={category}
                onChange={(e: any) => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="TRAVEL">Travel / Cab / Local Conveyance</option>
                <option value="FUEL">Fuel / Petrol</option>
                <option value="FOOD">Meals / Client Refreshments</option>
                <option value="POSTAGE_COURIER">Courier & Speed Post</option>
                <option value="PURCHASE">Office Supplies / Book Purchase</option>
                <option value="FEE_PAID_PERSONALLY">Official Fee Paid Personally</option>
                <option value="OTHER">Other Out-of-Pocket Expense</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Total Claim Amount (₹) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount || ''}
                onChange={(e) => setAmount(Number(e.target.value))}
                required
                placeholder="0.00"
                className="w-full px-3 py-2 text-sm font-mono font-bold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Mode *</label>
              <select
                value={paidWith}
                onChange={(e: any) => setPaidWith(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="OWN_UPI">Personal UPI / Google Pay</option>
                <option value="OWN_CARD">Personal Credit / Debit Card</option>
                <option value="OWN_CASH">Personal Cash</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Description / Purpose *</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              placeholder="e.g. Travel to High Court for hearing in ABC Matter, auto fare..."
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Receipt Attachment vs Override */}
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-800">Proof of Payment (Bill / Receipt)</label>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="hasReceipt"
                  checked={hasReceipt}
                  onChange={(e) => setHasReceipt(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded-md focus:ring-emerald-500"
                />
                <label htmlFor="hasReceipt" className="text-xs text-slate-600 cursor-pointer">
                  Receipt Available
                </label>
              </div>
            </div>

            {!hasReceipt && (
              <div>
                <label className="block text-[11px] font-semibold text-rose-700 mb-1">
                  Bill Missing — Reason for Manager Override *
                </label>
                <input
                  type="text"
                  value={billOverrideReason}
                  onChange={(e) => setBillOverrideReason(e.target.value)}
                  placeholder="e.g. Local auto rickshaw without receipt, cash toll plaza receipt lost"
                  required={!hasReceipt}
                  className="w-full px-3 py-1.5 text-xs bg-white border border-rose-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-500 text-rose-900"
                />
              </div>
            )}
          </div>

          <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
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
              {loading ? 'Submitting...' : 'Submit Claim'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
