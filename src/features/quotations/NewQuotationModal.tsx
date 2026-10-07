// src/features/quotations/NewQuotationModal.tsx
import React, { useState, useEffect } from 'react';
import { X, AlertCircle, Plus, Trash2, CheckCircle2, FileText, ArrowRight } from 'lucide-react';
import { coreDb, financeDb, isSupabaseConfigured } from '../../lib/supabase';
import { formatINR } from '../../lib/currency';

interface NewQuotationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (newQuoteId: string) => void;
  supersedingQuote?: any | null;
}

export const NewQuotationModal: React.FC<NewQuotationModalProps> = ({
  isOpen,
  onClose,
  onCreated,
  supersedingQuote,
}) => {
  const [clients, setClients] = useState<any[]>([]);
  const [projectCodes, setProjectCodes] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [eventCodes, setEventCodes] = useState<any[]>([]);

  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [quoteNumber, setQuoteNumber] = useState('');
  const [totalProfFee, setTotalProfFee] = useState(0);
  const [estGovtFee, setEstGovtFee] = useState(0);
  const [gstApplicable, setGstApplicable] = useState(true);
  const [notes, setNotes] = useState('');
  const [amendmentReason, setAmendmentReason] = useState('');

  // Stages array
  const [stages, setStages] = useState<
    Array<{
      stage_key: string;
      name: string;
      allocated_amount: number;
      trigger_event_code: string;
      manual_completion: boolean;
    }>
  >([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load masters
  useEffect(() => {
    if (!isOpen || !isSupabaseConfigured) return;

    const loadData = async () => {
      try {
        const [cRes, tmplRes, evRes] = await Promise.all([
          coreDb.from('clients').select('id, client_code, client_name').order('client_name'),
          financeDb.from('stage_templates').select('*').eq('active', true),
          coreDb.from('event_codes').select('code, domain, description').order('code'),
        ]);

        setClients(cRes.data || []);
        setTemplates(tmplRes.data || []);
        setEventCodes(evRes.data || []);

        if (supersedingQuote) {
          setSelectedClientId(supersedingQuote.client_id);
          setSelectedProjectId(supersedingQuote.project_code_id);
          setQuoteNumber(supersedingQuote.quote_number);
          setTotalProfFee(Number(supersedingQuote.total_prof_fee || 0));
          setEstGovtFee(Number(supersedingQuote.est_govt_fee || 0));
          setGstApplicable(Boolean(supersedingQuote.gst_applicable));
          setNotes(supersedingQuote.notes || '');
        } else {
          setQuoteNumber(`QT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
        }
      } catch (e) {
        console.error(e);
      }
    };
    loadData();
  }, [isOpen, supersedingQuote]);

  // Load project codes when client is selected
  useEffect(() => {
    if (!selectedClientId || !isSupabaseConfigured) return;
    const fetchPC = async () => {
      const { data } = await coreDb
        .from('project_codes')
        .select('id, code, title')
        .eq('client_id', selectedClientId)
        .order('code');
      setProjectCodes(data || []);
      if (data && data.length > 0 && !selectedProjectId) {
        setSelectedProjectId(data[0].id);
      }
    };
    fetchPC();
  }, [selectedClientId]);

  // Handle stage template selection
  const handleApplyTemplate = (tmplId: string) => {
    const tmpl = templates.find((t) => t.id === tmplId);
    if (!tmpl || !tmpl.items) return;

    const baseFee = totalProfFee > 0 ? totalProfFee : 50000;
    if (totalProfFee === 0) setTotalProfFee(baseFee);

    const newStages = tmpl.items.map((item: any) => ({
      stage_key: item.stage_key || item.name.toUpperCase().replace(/\s/g, '_'),
      name: item.name,
      allocated_amount: Math.round((baseFee * (Number(item.percent) || 0)) / 100),
      trigger_event_code: item.trigger_event_code || '',
      manual_completion: Boolean(item.manual),
    }));

    setStages(newStages);
  };

  const handleAddStage = () => {
    setStages([
      ...stages,
      {
        stage_key: `STAGE_${stages.length + 1}`,
        name: `Stage ${stages.length + 1}`,
        allocated_amount: 0,
        trigger_event_code: '',
        manual_completion: false,
      },
    ]);
  };

  const handleRemoveStage = (idx: number) => {
    setStages(stages.filter((_, i) => i !== idx));
  };

  const handleStageChange = (idx: number, field: string, val: any) => {
    const copy = [...stages];
    (copy[idx] as any)[field] = val;
    setStages(copy);
  };

  // Difference live computation
  const sumStages = stages.reduce((acc, s) => acc + (Number(s.allocated_amount) || 0), 0);
  const diff = totalProfFee - sumStages;
  const isBalanced = Math.abs(diff) < 0.01 && stages.length > 0;

  // Validation
  const hasInvalidTrigger = stages.some((s) => !s.manual_completion && !s.trigger_event_code);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientId || !selectedProjectId || !quoteNumber.trim()) {
      setError('Please select Client, Project Code, and Quote Number.');
      return;
    }
    if (!isBalanced) {
      setError(`Stage allocations must match the total professional fee. Difference: ${formatINR(diff)}`);
      return;
    }
    if (hasInvalidTrigger) {
      setError('Every stage must have a trigger event code or be marked as manual completion.');
      return;
    }
    if (supersedingQuote && !amendmentReason.trim()) {
      setError('Please provide an amendment reason for superseding this quotation.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (isSupabaseConfigured) {
        const { data, error: rpcErr } = await financeDb.rpc('create_quotation_with_stages', {
          p_project_code_id: selectedProjectId,
          p_client_id: selectedClientId,
          p_quote_number: quoteNumber.trim(),
          p_total_prof_fee: totalProfFee,
          p_est_govt_fee: estGovtFee,
          p_gst_applicable: gstApplicable,
          p_stages: stages,
          p_notes: notes.trim() || null,
          p_supersedes_id: supersedingQuote ? supersedingQuote.id : null,
          p_amendment_reason: amendmentReason.trim() || null,
        });

        if (rpcErr) throw new Error(rpcErr.message);

        onCreated(data);
        onClose();
      } else {
        onCreated('mock-quote-id');
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create quotation.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-600" />
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {supersedingQuote ? `Amend Quotation (${supersedingQuote.quote_number} v${(supersedingQuote.version || 1) + 1})` : 'New Quotation Builder'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 text-xs">
          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl flex items-center gap-2 text-rose-700 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {supersedingQuote && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl">
              <label className="block font-bold text-amber-900 dark:text-amber-200 mb-1">
                Reason for Amendment *
              </label>
              <input
                type="text"
                required
                value={amendmentReason}
                onChange={(e) => setAmendmentReason(e.target.value)}
                placeholder="e.g. Scope revised as per client email dated 07-10-2026..."
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-emerald-600"
              />
            </div>
          )}

          {/* Top Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Client *
              </label>
              <select
                required
                value={selectedClientId}
                disabled={Boolean(supersedingQuote)}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-emerald-600"
              >
                <option value="">Select Client...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.client_code} - {c.client_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Project Code *
              </label>
              <select
                required
                value={selectedProjectId}
                disabled={Boolean(supersedingQuote)}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-emerald-600 font-mono"
              >
                <option value="">Select Matter...</option>
                {projectCodes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} - {p.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Quote Number *
              </label>
              <input
                type="text"
                required
                value={quoteNumber}
                onChange={(e) => setQuoteNumber(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 font-mono focus:outline-emerald-600"
              />
            </div>
          </div>

          {/* Pricing Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Total Professional Fee (₹) *
              </label>
              <input
                type="number"
                min="0"
                step="500"
                required
                value={totalProfFee}
                onChange={(e) => setTotalProfFee(Number(e.target.value))}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 font-bold focus:outline-emerald-600"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Estimated Govt Fee (₹)
              </label>
              <input
                type="number"
                min="0"
                step="500"
                value={estGovtFee}
                onChange={(e) => setEstGovtFee(Number(e.target.value))}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-emerald-600"
              />
            </div>

            <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                id="gstApplicable"
                checked={gstApplicable}
                onChange={(e) => setGstApplicable(e.target.checked)}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
              />
              <label htmlFor="gstApplicable" className="font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                GST Applicable (18%)
              </label>
            </div>
          </div>

          {/* Template Fast Pick */}
          <div className="flex items-center justify-between pb-1 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-700 dark:text-slate-300">Stage Template:</span>
              <select
                onChange={(e) => handleApplyTemplate(e.target.value)}
                className="px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-slate-800 dark:text-slate-200 text-xs"
              >
                <option value="">Apply a pre-defined stage template...</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleAddStage}
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Custom Stage</span>
            </button>
          </div>

          {/* Stages Table */}
          <div className="space-y-2">
            {stages.map((stg, idx) => (
              <div
                key={idx}
                className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center"
              >
                <div className="sm:col-span-3">
                  <label className="text-[10px] text-slate-400 block">Stage Name</label>
                  <input
                    type="text"
                    required
                    value={stg.name}
                    onChange={(e) => handleStageChange(idx, 'name', e.target.value)}
                    placeholder="e.g. Provisional Filing"
                    className="w-full px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-xs text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-[10px] text-slate-400 block">Amount (₹)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={stg.allocated_amount}
                    onChange={(e) => handleStageChange(idx, 'allocated_amount', Number(e.target.value))}
                    className="w-full px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-xs font-bold text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div className="sm:col-span-4">
                  <label className="text-[10px] text-slate-400 block">
                    {stg.manual_completion ? 'Manual Milestone' : 'Trigger Event Code *'}
                  </label>
                  {stg.manual_completion ? (
                    <div className="text-[11px] text-emerald-600 italic py-1">
                      Manually completed by Finance/Admin
                    </div>
                  ) : (
                    <select
                      value={stg.trigger_event_code || ''}
                      onChange={(e) => handleStageChange(idx, 'trigger_event_code', e.target.value)}
                      className="w-full px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-xs text-slate-900 dark:text-slate-100"
                    >
                      <option value="">Select Trigger Code...</option>
                      {eventCodes.map((ev) => (
                        <option key={ev.code} value={ev.code}>
                          {ev.code} - {ev.description}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="sm:col-span-2 flex items-center gap-1.5 pt-3 sm:pt-0">
                  <input
                    type="checkbox"
                    id={`manual_${idx}`}
                    checked={stg.manual_completion}
                    onChange={(e) => handleStageChange(idx, 'manual_completion', e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer"
                  />
                  <label htmlFor={`manual_${idx}`} className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 cursor-pointer">
                    Manual
                  </label>
                </div>

                <div className="sm:col-span-1 text-right pt-2 sm:pt-0">
                  <button
                    type="button"
                    onClick={() => handleRemoveStage(idx)}
                    className="p-1 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

            {stages.length === 0 && (
              <div className="py-8 text-center text-xs text-slate-400 italic border border-dashed border-slate-300 dark:border-slate-700 rounded-lg">
                No billing stages added. Pick a template above or click "Add Custom Stage".
              </div>
            )}
          </div>

          {/* Live Balance Strip */}
          <div className="p-3 rounded-xl border flex items-center justify-between text-xs font-semibold bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700">
            <div>
              <span>Sum of Stages: </span>
              <strong className="text-slate-900 dark:text-slate-100">{formatINR(sumStages)}</strong>
              <span className="mx-2 text-slate-400">/</span>
              <span>Total Fee: </span>
              <strong className="text-slate-900 dark:text-slate-100">{formatINR(totalProfFee)}</strong>
            </div>

            <div className="flex items-center gap-1.5">
              {isBalanced ? (
                <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Balanced (₹0 difference)</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                  <AlertCircle className="w-4 h-4" />
                  <span>Difference: {formatINR(diff)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Internal Quotation Notes
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Payment terms, retainer clause, client special discount..."
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-emerald-600"
            />
          </div>

          {/* Footer buttons */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !isBalanced || hasInvalidTrigger}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5"
            >
              {saving ? 'Creating Quotation...' : 'Create Quotation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
export default NewQuotationModal;
