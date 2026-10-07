// src/features/quotations/QuotationsView.tsx
import React, { useState, useEffect } from 'react';
import {
  FileText,
  Search,
  Plus,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  FileSignature,
  Edit3,
} from 'lucide-react';
import { financeDb, isSupabaseConfigured } from '../../lib/supabase';
import { formatINR } from '../../lib/currency';
import { NewQuotationModal } from './NewQuotationModal';
import { EsignStatusModal } from './EsignStatusModal';

export const QuotationsView: React.FC = () => {
  const [quotations, setQuotations] = useState<any[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<any | null>(null);
  const [quoteStages, setQuoteStages] = useState<any[]>([]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);

  // Modals
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isEsignModalOpen, setIsEsignModalOpen] = useState(false);
  const [supersedingQuote, setSupersedingQuote] = useState<any | null>(null);

  const fetchQuotations = async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await financeDb
        .from('quotations_view')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setQuotations(data);
        if (data.length > 0 && !selectedQuote) {
          setSelectedQuote(data[0]);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuotations();
  }, []);

  // When quotation is selected, load its stages
  useEffect(() => {
    if (!selectedQuote || !isSupabaseConfigured) return;
    const fetchStages = async () => {
      const { data } = await financeDb
        .from('billing_stages')
        .select('*')
        .eq('quotation_id', selectedQuote.id)
        .order('created_at', { ascending: true });
      setQuoteStages(data || []);
    };
    fetchStages();
  }, [selectedQuote]);

  const filtered = quotations.filter((q) => {
    const matchesSearch =
      q.quote_number?.toLowerCase().includes(search.toLowerCase()) ||
      q.client_name?.toLowerCase().includes(search.toLowerCase()) ||
      q.project_code?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || q.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleAmendQuote = (q: any) => {
    // Check if stages are completed or invoiced
    const hasCompletedOrInvoiced = quoteStages.some(
      (s) => s.is_completed || s.billing_status === 'INVOICED' || s.billing_status === 'PAID'
    );
    if (hasCompletedOrInvoiced) {
      alert('Rule 1: Completed or invoiced stages cannot be edited in an amendment.');
      return;
    }
    setSupersedingQuote(q);
    setIsNewModalOpen(true);
  };

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
            <FileText className="w-6 h-6 text-emerald-600" />
            <span>Quotations &amp; Fee Engagements</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Stage-linked fee agreements, trigger event mappings, amendments, and e-signatures.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setSupersedingQuote(null);
            setIsNewModalOpen(true);
          }}
          className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs shadow-emerald-600/30 transition cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>New Quotation</span>
        </button>
      </div>

      {/* Main Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Quotes List (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search quote #, client, matter..."
                className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-900 dark:text-slate-100 focus:outline-emerald-600"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-700 dark:text-slate-300 focus:outline-emerald-600"
            >
              <option value="ALL">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="SENT">Sent</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="SUPERSEDED">Superseded</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-400 flex justify-between">
              <span>Quotations ({filtered.length})</span>
              <span>Total Fee</span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[600px] overflow-y-auto">
              {filtered.map((q) => {
                const isSelected = selectedQuote?.id === q.id;
                return (
                  <div
                    key={q.id}
                    onClick={() => setSelectedQuote(q)}
                    className={`p-3.5 cursor-pointer transition flex items-center justify-between text-xs ${
                      isSelected
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-l-4 border-emerald-600'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <span className="font-mono text-emerald-700 dark:text-emerald-300 font-bold">
                          {q.quote_number}
                        </span>
                        <span className="text-[10px] font-mono px-1 py-0.2 bg-slate-100 dark:bg-slate-800 rounded">
                          v{q.version}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {q.client_name} • {q.project_code}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase ${
                            q.status === 'CONFIRMED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : q.status === 'SENT'
                              ? 'bg-blue-100 text-blue-800'
                              : q.status === 'SUPERSEDED'
                              ? 'bg-slate-200 text-slate-700'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {q.status}
                        </span>
                        {q.confirmed_via && (
                          <span className="text-[9px] font-mono text-slate-400">
                            via {q.confirmed_via}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-bold text-slate-900 dark:text-slate-100">
                        {formatINR(q.total_prof_fee)}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Govt: {formatINR(q.est_govt_fee)}
                      </div>
                    </div>
                  </div>
                );
              })}

              {filtered.length === 0 && (
                <div className="py-8 text-center text-xs text-slate-400 italic">
                  No quotations match criteria.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Quotation Stages & Breakdown (7 cols) */}
        <div className="lg:col-span-7">
          {selectedQuote ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-2xs space-y-6">
              {/* Header Details & Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      {selectedQuote.quote_number} (Version {selectedQuote.version})
                    </h2>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                        selectedQuote.status === 'CONFIRMED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : selectedQuote.status === 'SENT'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {selectedQuote.status}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Client: <strong>{selectedQuote.client_name}</strong> • Matter: <strong className="font-mono">{selectedQuote.project_code}</strong>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEsignModalOpen(true)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 rounded-lg text-xs font-semibold transition cursor-pointer"
                  >
                    <FileSignature className="w-3.5 h-3.5" />
                    <span>E-Sign &amp; Status</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAmendQuote(selectedQuote)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 rounded-lg text-xs font-semibold transition cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Amend Version</span>
                  </button>
                </div>
              </div>

              {/* Fee Summary Cards */}
              <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px]">Professional Fee</span>
                  <strong className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {formatINR(selectedQuote.total_prof_fee)}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Estimated Govt Fee</span>
                  <strong className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {formatINR(selectedQuote.est_govt_fee)}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">GST Applicability</span>
                  <strong className="text-slate-800 dark:text-slate-200">
                    {selectedQuote.gst_applicable ? '18% Applicable' : 'Exempt'}
                  </strong>
                </div>
              </div>

              {/* Stages List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-xs uppercase tracking-wider text-slate-400">
                    Allocated Billing Stages ({quoteStages.length})
                  </h3>
                  <span className="text-[11px] text-slate-500">
                    Sum: {formatINR(quoteStages.reduce((a, s) => a + Number(s.allocated_amount || 0), 0))}
                  </span>
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
                  {quoteStages.map((stg) => (
                    <div
                      key={stg.id}
                      className="p-3 bg-white dark:bg-slate-900 flex items-center justify-between text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                          <span>{stg.name}</span>
                          {stg.is_completed && (
                            <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-0.5">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Completed</span>
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-2">
                          <span>Trigger: {stg.trigger_event_code || 'Manual Milestone'}</span>
                          {stg.completed_at && (
                            <span>• Date: {new Date(stg.completed_at).toLocaleDateString('en-IN')}</span>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="font-bold text-slate-900 dark:text-slate-100">
                          {formatINR(stg.allocated_amount)}
                        </div>
                        <span
                          className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                            stg.billing_status === 'PAID'
                              ? 'bg-emerald-100 text-emerald-800'
                              : stg.billing_status === 'INVOICED'
                              ? 'bg-blue-100 text-blue-800'
                              : stg.billing_status === 'UNBILLED_WORK_DONE'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                          }`}
                        >
                          {stg.billing_status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {selectedQuote.notes && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg text-xs text-slate-600 dark:text-slate-300">
                  <span className="font-bold text-slate-400 text-[10px] uppercase block mb-1">Quotation Notes</span>
                  <p>{selectedQuote.notes}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="py-16 text-center text-xs text-slate-400 italic bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
              Select a quotation to inspect stages and e-sign history.
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <NewQuotationModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        supersedingQuote={supersedingQuote}
        onCreated={() => fetchQuotations()}
      />

      <EsignStatusModal
        isOpen={isEsignModalOpen}
        onClose={() => setIsEsignModalOpen(false)}
        quotation={selectedQuote}
        onUpdated={() => fetchQuotations()}
      />
    </div>
  );
};
export default QuotationsView;
