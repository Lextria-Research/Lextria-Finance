// src/features/govtFees/NewGovtFeeModal.tsx
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Landmark, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { financeDb, coreDb } from '../../lib/supabase';
import { formatINR } from '../../lib/currency';
import { getStoredUser } from '../../lib/auth';
import type { CoreProjectCode, FeeScheduleItem, GovtFeeRequest } from '../../lib/types';

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

export default function NewGovtFeeModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [projectCodeId, setProjectCodeId] = useState('');
  const [form, setForm] = useState('');
  const [applicantCategory, setApplicantCategory] = useState<'NATURAL_PERSON' | 'STARTUP' | 'SMALL_ENTITY' | 'LARGE_ENTITY' | 'OTHER'>('LARGE_ENTITY');
  const [amount, setAmount] = useState<number>(0);
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [recoverable, setRecoverable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch project codes with client
  const { data: projectCodes = [] } = useQuery({
    queryKey: ['core-project-codes-list'],
    queryFn: async () => {
      const { data, error } = await coreDb
        .from('project_codes')
        .select(`
          id, code, title, client_id,
          clients:client_id (
            id, client_code, client_name, entity_type
          )
        `)
        .order('code');
      if (error) throw error;
      return (data || []) as any[];
    }
  });

  // Fetch fee schedule items
  const { data: feeSchedule = [] } = useQuery({
    queryKey: ['fee-schedule-items'],
    queryFn: async () => {
      const { data, error } = await financeDb
        .from('fee_schedule')
        .select('*')
        .order('form_or_action');
      if (error) throw error;
      return (data || []) as FeeScheduleItem[];
    }
  });

  // 7-day duplicate check
  const { data: recentRequests = [] } = useQuery({
    queryKey: ['recent-govt-fees', projectCodeId, form],
    enabled: !!projectCodeId && !!form,
    queryFn: async () => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data, error } = await financeDb
        .from('govt_fee_requests')
        .select('id, form, amount, created_at, status')
        .eq('project_code_id', projectCodeId)
        .eq('form', form)
        .gte('created_at', sevenDaysAgo.toISOString());
      if (error) throw error;
      return (data || []) as GovtFeeRequest[];
    }
  });

  // When project code changes, auto-set applicant category from client
  useEffect(() => {
    if (projectCodeId) {
      const p = projectCodes.find(x => x.id === projectCodeId);
      if (p?.clients?.entity_type) {
        setApplicantCategory(p.clients.entity_type as any);
      }
    }
  }, [projectCodeId, projectCodes]);

  // When form or category changes, check fee schedule
  const handleFormSelect = (selectedForm: string) => {
    setForm(selectedForm);
    const match = feeSchedule.find(
      s => s.form_or_action.toLowerCase() === selectedForm.toLowerCase() &&
           s.applicant_fee_category.toLowerCase() === applicantCategory.toLowerCase()
    );
    if (match) {
      setAmount(match.efiling_amount);
    }
  };

  const isDuplicateWarning = recentRequests.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!projectCodeId || !form.trim() || amount <= 0) {
      setErrorMsg('Please fill all required fields');
      return;
    }

    try {
      setLoading(true);
      const user = getStoredUser();

      const { error } = await financeDb.from('govt_fee_requests').insert({
        project_code_id: projectCodeId,
        form: form.trim(),
        applicant_fee_category: applicantCategory,
        amount,
        adjustment_reason: adjustmentReason.trim() || null,
        requested_by: user?.id,
        status: 'REQUESTED',
        recoverable
      });

      if (error) throw error;
      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit fee request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-3xl shadow-xl border border-slate-200 max-w-lg w-full p-6 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Request Official Govt Fee</h3>
              <p className="text-xs text-slate-500">IPO/Court official fee requisition for matter filing</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-xs text-rose-700 rounded-xl">
              {errorMsg}
            </div>
          )}

          {/* 7-day duplicate warning */}
          {isDuplicateWarning && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong>Warning: Recent duplicate request detected!</strong>
                <p className="mt-0.5 text-amber-700">
                  A request for {form} on this matter was already raised in the last 7 days ({recentRequests.length} found). Please verify you are not filing twice.
                </p>
              </div>
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">Applicant Entity Category *</label>
              <select
                value={applicantCategory}
                onChange={(e: any) => {
                  setApplicantCategory(e.target.value);
                  if (form) handleFormSelect(form);
                }}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="NATURAL_PERSON">Natural Person</option>
                <option value="STARTUP">Startup</option>
                <option value="SMALL_ENTITY">Small Entity</option>
                <option value="LARGE_ENTITY">Large Entity</option>
                <option value="OTHER">Other / Govt</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Statutory Form / Action *</label>
              <input
                type="text"
                value={form}
                onChange={(e) => handleFormSelect(e.target.value)}
                placeholder="e.g. Form 1, Form 18, TM-A"
                required
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Official Fee Amount (₹) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount || ''}
                onChange={(e) => setAmount(Number(e.target.value))}
                required
                className="w-full px-3 py-2 text-sm font-mono font-bold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Recoverable from Client?</label>
              <div className="pt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="rec"
                  checked={recoverable}
                  onChange={(e) => setRecoverable(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded-md focus:ring-emerald-500"
                />
                <label htmlFor="rec" className="text-xs text-slate-700 cursor-pointer">
                  Yes, Pure Agent recovery
                </label>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Adjustment / Requisition Note</label>
            <textarea
              rows={2}
              value={adjustmentReason}
              onChange={(e) => setAdjustmentReason(e.target.value)}
              placeholder="e.g. Additional pages / claims fee calculation..."
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition"
            >
              {loading ? 'Submitting...' : 'Submit Fee Requisition'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
