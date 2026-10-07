// src/features/invoices/ReadyToInvoiceView.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckSquare,
  AlertTriangle,
  Receipt,
  FileCheck2,
  Building,
  CheckCircle2,
  DollarSign,
  ArrowRight,
} from 'lucide-react';
import { financeDb, coreDb, isSupabaseConfigured } from '../../lib/supabase';
import { formatINR } from '../../lib/currency';
import { clock } from '../../lib/clock';

export const ReadyToInvoiceView: React.FC = () => {
  const navigate = useNavigate();

  const [clients, setClients] = useState<any[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [firmStateCode, setFirmStateCode] = useState<string>('27'); // default Maharashtra

  const [stages, setStages] = useState<any[]>([]);
  const [costs, setCosts] = useState<any[]>([]);

  const [selectedStageIds, setSelectedStageIds] = useState<string[]>([]);
  const [selectedCostIds, setSelectedCostIds] = useState<string[]>([]);

  // Zoho invoice form inputs
  const [zohoInvoiceNo, setZohoInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(clock.todayYMD());
  const [enteredTotal, setEnteredTotal] = useState<number>(0);
  const [notes, setNotes] = useState('');

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load clients & firm state setting
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    const loadInit = async () => {
      try {
        const [cRes, stRes] = await Promise.all([
          coreDb.from('clients').select('id, client_code, client_name, state_code').order('client_name'),
          coreDb.from('app_settings').select('value').eq('app', 'FINANCE').eq('key', 'firm_state_code').maybeSingle(),
        ]);
        setClients(cRes.data || []);
        if (cRes.data && cRes.data.length > 0 && !selectedClientId) {
          setSelectedClientId(cRes.data[0].id);
        }
        if (stRes.data?.value) {
          setFirmStateCode(String(stRes.data.value).replace(/"/g, ''));
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    loadInit();
  }, []);

  // When client changes, load ready stages & costs
  useEffect(() => {
    if (!selectedClientId || !isSupabaseConfigured) return;

    const fetchReadyItems = async () => {
      try {
        const [stgRes, costRes] = await Promise.all([
          financeDb
            .from('billing_stages_view')
            .select('*')
            .eq('client_id', selectedClientId)
            .eq('is_completed', true)
            .eq('billing_status', 'UNBILLED_WORK_DONE'),
          financeDb
            .from('recoverable_costs_view')
            .select('*')
            .eq('client_id', selectedClientId)
            .eq('posting_status', 'AUTO_POSTED')
            .is('recovered_via_invoice_ref_id', null),
        ]);

        const stgData = stgRes.data || [];
        const costData = costRes.data || [];
        setStages(stgData);
        setCosts(costData);

        // Pre-select all by default for speed
        const stgIds = stgData.map((s) => s.id);
        const cIds = costData.map((c) => c.id);
        setSelectedStageIds(stgIds);
        setSelectedCostIds(cIds);
      } catch (e) {
        console.error(e);
      }
    };

    fetchReadyItems();
  }, [selectedClientId]);

  // Selected client object
  const activeClient = clients.find((c) => c.id === selectedClientId);

  // Calculations
  const profTaxable = stages
    .filter((s) => selectedStageIds.includes(s.id))
    .reduce((acc, s) => acc + Number(s.allocated_amount || 0), 0);

  const reimbAmount = costs
    .filter((c) => selectedCostIds.includes(c.id))
    .reduce((acc, c) => acc + Number(c.amount || 0), 0);

  // GST determination: Check client state vs firm state
  const clientState = activeClient?.state_code || '27';
  const isSameState = clientState === firmStateCode;

  // 18% GST on professional fee
  const gstAmount = Math.round(profTaxable * 0.18 * 100) / 100;
  const calculatedTotal = profTaxable + gstAmount + reimbAmount;

  // Sync enteredTotal to calculatedTotal whenever selection changes
  useEffect(() => {
    setEnteredTotal(calculatedTotal);
  }, [calculatedTotal]);

  const diff = Math.abs(enteredTotal - calculatedTotal);
  const hasVariance = diff > 1.0;

  const handleStageToggle = (id: string) => {
    if (selectedStageIds.includes(id)) {
      setSelectedStageIds(selectedStageIds.filter((x) => x !== id));
    } else {
      setSelectedStageIds([...selectedStageIds, id]);
    }
  };

  const handleCostToggle = (id: string) => {
    if (selectedCostIds.includes(id)) {
      setSelectedCostIds(selectedCostIds.filter((x) => x !== id));
    } else {
      setSelectedCostIds([...selectedCostIds, id]);
    }
  };

  const handleRecordInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!zohoInvoiceNo.trim()) {
      setError('Zoho Books invoice number is required.');
      return;
    }
    if (selectedStageIds.length === 0 && selectedCostIds.length === 0) {
      setError('Please select at least one stage or recoverable cost to invoice.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      if (isSupabaseConfigured) {
        const { data, error: rpcErr } = await financeDb.rpc(
          'record_invoice_with_stages_and_costs',
          {
            p_zoho_books_invoice_no: zohoInvoiceNo.trim(),
            p_invoice_date: invoiceDate,
            p_client_id: selectedClientId,
            p_professional_taxable: profTaxable,
            p_gst_amount: gstAmount,
            p_reimbursement_amount: reimbAmount,
            p_total_amount: enteredTotal,
            p_notes: notes.trim() || null,
            p_stage_ids: selectedStageIds,
            p_cost_ids: selectedCostIds,
          }
        );

        if (rpcErr) throw new Error(rpcErr.message);

        setSuccess(`Invoice #${zohoInvoiceNo} successfully recorded and linked!`);
        setZohoInvoiceNo('');
        setTimeout(() => {
          navigate('/invoices');
        }, 1500);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to record invoice.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
            <CheckSquare className="w-6 h-6 text-emerald-600" />
            <span>Ready to Invoice Batching</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Rule 4: Completing work enters Ready to Invoice. Group completed stages &amp; posted disbursements, then enter Zoho Books reference.
          </p>
        </div>

        {/* Client selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Client:</label>
          <select
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
            className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-emerald-600"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.client_code} - {c.client_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {success && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-800 dark:text-rose-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Grid: Left Items Selection (7 cols) + Right Zoho Invoice Form (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Unbilled Stages & Costs */}
        <div className="lg:col-span-7 space-y-5">
          {/* 1. Completed Billing Stages */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <FileCheck2 className="w-4 h-4 text-emerald-600" />
                <span>Completed Work Stages ({stages.length})</span>
              </h3>
              <span className="text-xs font-semibold text-slate-500">
                {selectedStageIds.length} of {stages.length} selected
              </span>
            </div>

            {stages.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 italic bg-slate-50 dark:bg-slate-800/40 rounded-lg">
                No unbilled completed stages found for this client.
              </div>
            ) : (
              <div className="space-y-2">
                {stages.map((stg) => {
                  const isChecked = selectedStageIds.includes(stg.id);
                  return (
                    <div
                      key={stg.id}
                      onClick={() => handleStageToggle(stg.id)}
                      className={`p-3 rounded-lg border text-xs cursor-pointer transition flex items-center justify-between ${
                        isChecked
                          ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30'
                          : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="w-4 h-4 rounded text-emerald-600 cursor-pointer"
                        />
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                            <span>{stg.name}</span>
                            <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">
                              {stg.project_code}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Completed: {stg.completed_at ? new Date(stg.completed_at).toLocaleDateString('en-IN') : 'Recently'}
                            {stg.quote_number && ` • Quote #${stg.quote_number}`}
                          </div>
                        </div>
                      </div>

                      <div className="text-right font-bold text-slate-900 dark:text-slate-100">
                        {formatINR(stg.allocated_amount)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 2. Auto-Posted Recoverable Disbursements */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-blue-600" />
                <span>Recoverable Disbursements ({costs.length})</span>
              </h3>
              <span className="text-xs font-semibold text-slate-500">
                {selectedCostIds.length} of {costs.length} selected
              </span>
            </div>

            {costs.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400 italic bg-slate-50 dark:bg-slate-800/40 rounded-lg">
                No posted recoverable costs awaiting invoice inclusion.
              </div>
            ) : (
              <div className="space-y-2">
                {costs.map((c) => {
                  const isChecked = selectedCostIds.includes(c.id);
                  return (
                    <div
                      key={c.id}
                      onClick={() => handleCostToggle(c.id)}
                      className={`p-3 rounded-lg border text-xs cursor-pointer transition flex items-center justify-between ${
                        isChecked
                          ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30'
                          : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="w-4 h-4 rounded text-blue-600 cursor-pointer"
                        />
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-slate-100">
                            {c.description}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Category: {c.category} • Date: {c.cost_date}
                          </div>
                        </div>
                      </div>

                      <div className="text-right font-bold text-slate-900 dark:text-slate-100">
                        {formatINR(c.amount)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Zoho Books Invoice Recording Form */}
        <div className="lg:col-span-5">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-2xs space-y-5 sticky top-4">
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-emerald-600" />
                <span>Zoho Books Invoice Summary</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Generate the official invoice in Zoho Books, then register the bill reference below.
              </p>
            </div>

            {/* Calculations Breakdown */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Professional Taxable:</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{formatINR(profTaxable)}</span>
              </div>

              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>
                  GST (18%):{' '}
                  <span className="text-[10px] font-mono text-slate-400">
                    {isSameState ? 'CGST 9% + SGST 9%' : 'IGST 18%'}
                  </span>
                </span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{formatINR(gstAmount)}</span>
              </div>

              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Reimbursements (Disbursements):</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{formatINR(reimbAmount)}</span>
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between font-bold text-sm text-slate-900 dark:text-slate-100">
                <span>Calculated Total:</span>
                <span className="text-emerald-600 dark:text-emerald-400">{formatINR(calculatedTotal)}</span>
              </div>
            </div>

            {/* Warning if variance > 1 */}
            {hasVariance && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Variance Warning: </span>
                  Entered total differs from calculated sum by {formatINR(diff)} ({formatINR(enteredTotal)} vs {formatINR(calculatedTotal)}).
                </div>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleRecordInvoice} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Zoho Books Invoice No *
                </label>
                <input
                  type="text"
                  required
                  value={zohoInvoiceNo}
                  onChange={(e) => setZohoInvoiceNo(e.target.value.toUpperCase())}
                  placeholder="e.g. INV-2026-089"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 font-mono font-bold focus:outline-emerald-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Invoice Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-emerald-600 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Entered Total (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={enteredTotal}
                    onChange={(e) => setEnteredTotal(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 font-bold focus:outline-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Invoice Notes / Narrative
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Description for the client statement..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-emerald-600"
                />
              </div>

              <button
                type="submit"
                disabled={submitting || (selectedStageIds.length === 0 && selectedCostIds.length === 0)}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-lg shadow-xs shadow-emerald-600/30 transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                {submitting ? 'Recording Invoice...' : 'Record Zoho Invoice & Mark Stages Invoiced'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
export default ReadyToInvoiceView;
