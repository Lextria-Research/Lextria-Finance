// src/features/misc/NewMiscJobModal.tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Briefcase, Calculator } from 'lucide-react';
import { financeDb, coreDb } from '../../lib/supabase';
import { formatINR } from '../../lib/currency';
import { getStoredUser } from '../../lib/auth';
import type { Vendor, CoreProjectCode } from '../../lib/types';

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

export default function NewMiscJobModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [projectCodeId, setProjectCodeId] = useState('');
  const [workType, setWorkType] = useState('Patent Prior Art Search');
  const [description, setDescription] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [amountCharged, setAmountCharged] = useState<number>(0);
  const [vendorCost, setVendorCost] = useState<number>(0);
  const [clientDueDate, setClientDueDate] = useState('');
  const [statutoryDueDate, setStatutoryDueDate] = useState('');
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

  // Fetch vendors
  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors-list'],
    queryFn: async () => {
      const { data, error } = await financeDb
        .from('vendors')
        .select('*')
        .eq('active', true)
        .order('name');
      if (error) throw error;
      return (data || []) as Vendor[];
    }
  });

  const marginAmount = amountCharged - vendorCost;
  const marginPercent = amountCharged > 0 ? (marginAmount / amountCharged) * 100 : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!projectCodeId || !description.trim()) {
      setErrorMsg('Please select a project code and provide a description');
      return;
    }

    const selectedProj = projectCodes.find(p => p.id === projectCodeId);

    try {
      setLoading(true);
      const user = getStoredUser();

      const { error } = await financeDb.from('misc_jobs').insert({
        project_code_id: projectCodeId,
        client_id: selectedProj?.client_id,
        work_type: workType.trim(),
        description: description.trim(),
        vendor_id: vendorId || null,
        status: 'RECEIVED',
        client_due_date: clientDueDate || null,
        statutory_due_date: statutoryDueDate || null,
        amount_charged: amountCharged,
        vendor_cost: vendorCost,
        vendor_payment_status: 'UNPAID',
        created_by: user?.id
      });

      if (error) throw error;
      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create misc job');
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
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Create Misc / Vendor Job</h3>
              <p className="text-xs text-slate-500">Track outsourced tasks, vendor cost, client billing & profit margin</p>
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">Work Type *</label>
              <input
                type="text"
                value={workType}
                onChange={(e) => setWorkType(e.target.value)}
                required
                placeholder="e.g. Translation, Search, Investigation"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Assign Vendor</label>
              <select
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">-- Direct / Unassigned --</option>
                {vendors.map(v => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Scope & Description *</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              placeholder="e.g. Japanese to English patent specification translation of JP2022091829"
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Financials & Auto Margin */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Calculator className="w-4 h-4 text-emerald-600" />
              Financials & Gross Margin
            </h4>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Client Charge (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amountCharged || ''}
                  onChange={(e) => setAmountCharged(Number(e.target.value))}
                  required
                  className="w-full px-3 py-2 text-sm font-mono font-bold bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Vendor Cost (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={vendorCost || ''}
                  onChange={(e) => setVendorCost(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200/70 flex justify-between text-xs">
              <span className="text-slate-500">Gross Margin:</span>
              <span className="font-mono font-bold text-emerald-700">
                {formatINR(marginAmount)} ({marginPercent.toFixed(1)}%)
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Client Delivery Due Date</label>
              <input
                type="date"
                value={clientDueDate}
                onChange={(e) => setClientDueDate(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Statutory Registry Due Date</label>
              <input
                type="date"
                value={statutoryDueDate}
                onChange={(e) => setStatutoryDueDate(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
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
              {loading ? 'Creating...' : 'Create Job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
