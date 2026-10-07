// src/features/payments/RecordPaymentModal.tsx
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, CreditCard, AlertCircle, CheckCircle2, Calculator } from 'lucide-react';
import { financeDb, coreDb } from '../../lib/supabase';
import { formatINR } from '../../lib/currency';
import { todayDateStr } from '../../lib/clock';
import type { CoreClient, InvoiceRef } from '../../lib/types';

interface Props {
  onClose: () => void;
  onSuccess: () => void;
  prefillInvoice?: InvoiceRef | null;
}

export default function RecordPaymentModal({ onClose, onSuccess, prefillInvoice }: Props) {
  const [selectedClientId, setSelectedClientId] = useState(prefillInvoice?.client_id || '');
  const [receivedDate, setReceivedDate] = useState(todayDateStr());
  const [grossAmount, setGrossAmount] = useState<number>(prefillInvoice ? Number(prefillInvoice.outstanding_amount || 0) : 0);
  const [tdsAmount, setTdsAmount] = useState<number>(0);
  const [mode, setMode] = useState<'NEFT' | 'RTGS' | 'IMPS' | 'UPI' | 'CHEQUE' | 'CASH' | 'OTHER'>('NEFT');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load clients
  const { data: clients = [] } = useQuery({
    queryKey: ['core-clients-list'],
    queryFn: async () => {
      const { data, error } = await coreDb
        .from('clients')
        .select('id, client_code, client_name')
        .order('client_name');
      if (error) throw error;
      return (data || []) as CoreClient[];
    }
  });

  // Load outstanding invoices for selected client
  const { data: outstandingInvoices = [] } = useQuery({
    queryKey: ['client-outstanding-invoices', selectedClientId],
    enabled: !!selectedClientId,
    queryFn: async () => {
      const { data, error } = await financeDb
        .from('invoices_view')
        .select('*')
        .eq('client_id', selectedClientId)
        .order('invoice_date', { ascending: true });
      if (error) throw error;
      return ((data || []) as InvoiceRef[]).filter(i => Number(i.outstanding_amount || 0) > 0.01);
    }
  });

  // Auto initialize allocation if prefillInvoice is supplied
  useEffect(() => {
    if (prefillInvoice && prefillInvoice.id) {
      const out = Number(prefillInvoice.outstanding_amount || 0);
      setAllocations({ [prefillInvoice.id]: out });
    }
  }, [prefillInvoice]);

  const netAmount = Math.max(0, grossAmount - tdsAmount);
  const totalAllocated = Object.values(allocations).reduce((sum, v) => sum + (Number(v) || 0), 0);
  const unallocatedGross = grossAmount - totalAllocated;

  // Auto-allocate helper: applies gross amount against oldest outstanding invoices first
  const handleAutoAllocate = () => {
    let remaining = grossAmount;
    const newAlloc: Record<string, number> = {};

    for (const inv of outstandingInvoices) {
      if (remaining <= 0) break;
      const out = Number(inv.outstanding_amount || 0);
      const toAlloc = Math.min(remaining, out);
      newAlloc[inv.id] = toAlloc;
      remaining -= toAlloc;
    }
    setAllocations(newAlloc);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!selectedClientId) {
      setErrorMsg('Please select a client');
      return;
    }
    if (grossAmount <= 0) {
      setErrorMsg('Gross payment amount must be greater than zero');
      return;
    }
    if (tdsAmount < 0 || tdsAmount > grossAmount) {
      setErrorMsg('TDS amount cannot exceed gross payment');
      return;
    }
    if (totalAllocated > grossAmount) {
      setErrorMsg(`Allocated total (${formatINR(totalAllocated)}) cannot exceed Gross payment (${formatINR(grossAmount)})`);
      return;
    }

    // Format allocation items for RPC
    const allocationItems = Object.entries(allocations)
      .filter(([_, amt]) => Number(amt) > 0)
      .map(([invoice_ref_id, amount]) => ({
        invoice_ref_id,
        recoverable_cost_id: null,
        amount: Number(amount)
      }));

    try {
      setIsSubmitting(true);

      const { data, error } = await financeDb.rpc('record_payment_with_allocations', {
        p_client_id: selectedClientId,
        p_received_date: receivedDate,
        p_gross_amount: grossAmount,
        p_tds_amount: tdsAmount,
        p_net_amount: netAmount,
        p_mode: mode,
        p_reference: reference.trim() || null,
        p_notes: notes.trim() || null,
        p_allocations: allocationItems
      });

      if (error) throw error;

      // If there is unallocated surplus, also record as client advance
      if (unallocatedGross > 0.01) {
        await financeDb.from('advances').insert({
          client_id: selectedClientId,
          received_date: receivedDate,
          amount: unallocatedGross,
          allocated_amount: 0,
          reference: reference.trim() || null,
          notes: `Excess balance from payment ${reference ? `(Ref: ${reference})` : ''} credited as advance.`
        });
      }

      onSuccess();
    } catch (err: any) {
      console.error('Error recording payment:', err);
      setErrorMsg(err.message || 'Failed to record payment');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-3xl shadow-xl border border-slate-200 max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Record Inward Payment</h2>
              <p className="text-xs text-slate-500">Record bank remittance, TDS deduction, and allocate against invoices</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-6 overflow-y-auto space-y-5">
            {errorMsg && (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-sm text-rose-800">
                <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Client Selection */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Client <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedClientId}
                onChange={(e) => {
                  setSelectedClientId(e.target.value);
                  setAllocations({});
                }}
                disabled={!!prefillInvoice}
                required
                className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-75"
              >
                <option value="">-- Select Client --</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.client_name} ({c.client_code})
                  </option>
                ))}
              </select>
            </div>

            {/* Payment Primary Details */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Gross Amount Received (₹) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={grossAmount || ''}
                  onChange={(e) => setGrossAmount(Number(e.target.value))}
                  required
                  placeholder="0.00"
                  className="w-full px-3.5 py-2.5 text-sm font-mono font-semibold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  TDS Deducted by Client (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={tdsAmount || ''}
                  onChange={(e) => setTdsAmount(Number(e.target.value))}
                  placeholder="0.00"
                  className="w-full px-3.5 py-2.5 text-sm font-mono bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">Usually 10% on professional fee</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Net Bank Inflow (₹)
                </label>
                <div className="w-full px-3.5 py-2.5 text-sm font-mono font-bold bg-slate-100 border border-slate-200 rounded-xl text-emerald-700">
                  {formatINR(netAmount)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Received Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={receivedDate}
                  onChange={(e) => setReceivedDate(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Payment Mode <span className="text-rose-500">*</span>
                </label>
                <select
                  value={mode}
                  onChange={(e: any) => setMode(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="NEFT">NEFT Bank Transfer</option>
                  <option value="RTGS">RTGS Transfer</option>
                  <option value="IMPS">IMPS Immediate</option>
                  <option value="UPI">UPI Digital Payment</option>
                  <option value="CHEQUE">Cheque / Demand Draft</option>
                  <option value="CASH">Cash</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Bank UTR / Cheque Ref #
                </label>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="e.g. UTR1298402948"
                  className="w-full px-3.5 py-2.5 text-sm font-mono bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Invoices Allocation Section */}
            <div className="pt-2 border-t border-slate-200">
              <div className="flex items-center justify-between mb-2.5">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Allocate Against Invoices ({outstandingInvoices.length} outstanding)
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Specify amount to clear against each invoice or click Auto-Allocate
                  </p>
                </div>

                {outstandingInvoices.length > 0 && grossAmount > 0 && (
                  <button
                    type="button"
                    onClick={handleAutoAllocate}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition"
                  >
                    <Calculator className="w-3.5 h-3.5" />
                    Auto-Allocate Oldest First
                  </button>
                )}
              </div>

              {outstandingInvoices.length === 0 ? (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-500 text-center">
                  {selectedClientId ? 'No outstanding unpaid invoices found for this client. Surplus will be saved as Client Advance.' : 'Select a client above to view outstanding invoices'}
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                  {outstandingInvoices.map(inv => {
                    const currentAlloc = allocations[inv.id] || 0;
                    const out = Number(inv.outstanding_amount || 0);

                    return (
                      <div key={inv.id} className="p-3 bg-white flex items-center justify-between gap-4 text-xs">
                        <div>
                          <div className="font-mono font-bold text-slate-900">{inv.zoho_books_invoice_no}</div>
                          <div className="text-slate-400">Date: {inv.invoice_date} • Outstanding: <span className="font-mono font-semibold text-amber-600">{formatINR(out)}</span></div>
                        </div>

                        <div className="flex items-center gap-2">
                          <label className="text-slate-400">Allocate ₹</label>
                          <input
                            type="number"
                            step="0.01"
                            max={out}
                            min="0"
                            value={currentAlloc || ''}
                            onChange={(e) => {
                              const val = Math.min(out, Math.max(0, Number(e.target.value)));
                              setAllocations(prev => ({ ...prev, [inv.id]: val }));
                            }}
                            className="w-28 px-2.5 py-1 text-xs font-mono font-semibold bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 text-right"
                            placeholder="0.00"
                          />
                          <button
                            type="button"
                            onClick={() => setAllocations(prev => ({ ...prev, [inv.id]: out }))}
                            className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 underline"
                          >
                            Full
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Allocation Totals Summary */}
              <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs flex justify-between items-center">
                <span>Total Allocated: <strong className="font-mono text-slate-800">{formatINR(totalAllocated)}</strong></span>
                <span>
                  {unallocatedGross > 0.01 ? (
                    <span className="text-emerald-700 font-medium">
                      + {formatINR(unallocatedGross)} will be credited as <strong>Client Advance</strong>
                    </span>
                  ) : unallocatedGross < -0.01 ? (
                    <span className="text-rose-600 font-medium">
                      Over-allocated by {formatINR(Math.abs(unallocatedGross))}
                    </span>
                  ) : (
                    <span className="text-emerald-600 flex items-center gap-1 font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" /> 100% Allocated
                    </span>
                  )}
                </span>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Internal Notes / Remittance Details
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Client bank reference, branch remarks, TDS certificate info..."
                className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-200 bg-slate-50/75 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || unallocatedGross < -0.01}
              className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting ? 'Saving Payment...' : 'Record Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
