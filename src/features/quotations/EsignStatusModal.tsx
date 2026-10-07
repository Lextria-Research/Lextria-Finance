// src/features/quotations/EsignStatusModal.tsx
import React, { useState, useEffect } from 'react';
import { X, ShieldAlert, CheckCircle2, Send, FileSignature, AlertCircle } from 'lucide-react';
import { financeDb, coreDb, isSupabaseConfigured } from '../../lib/supabase';
import { formatINR } from '../../lib/currency';

interface EsignStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  quotation: any | null;
  onUpdated: () => void;
}

export const EsignStatusModal: React.FC<EsignStatusModalProps> = ({
  isOpen,
  onClose,
  quotation,
  onUpdated,
}) => {
  const [esignReq, setEsignReq] = useState<any | null>(null);
  const [signers, setSigners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Override confirmation modal state
  const [showOverride, setShowOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideSaving, setOverrideSaving] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !quotation || !isSupabaseConfigured) return;

    const loadEsign = async () => {
      setLoading(true);
      try {
        const { data: req } = await financeDb
          .from('esign_requests')
          .select('*')
          .eq('quotation_id', quotation.id)
          .maybeSingle();

        setEsignReq(req);

        if (req) {
          const { data: s } = await financeDb
            .from('esign_signers')
            .select('*')
            .eq('esign_request_id', req.id)
            .order('signing_order');
          setSigners(s || []);
        } else {
          setSigners([]);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    loadEsign();
  }, [isOpen, quotation]);

  if (!isOpen || !quotation) return null;

  // Check if unsigned > 5 days
  let isUnsigned5Days = false;
  if (esignReq && (esignReq.status === 'SENT' || esignReq.status === 'PARTIALLY_SIGNED') && esignReq.sent_at) {
    const diff = (Date.now() - new Date(esignReq.sent_at).getTime()) / (1000 * 3600 * 24);
    if (diff > 5) isUnsigned5Days = true;
  }

  // Handle Send for E-Sign
  const handleInitiateEsign = async () => {
    try {
      const { data: createdReq, error: reqErr } = await financeDb
        .from('esign_requests')
        .insert({
          document_type: 'QUOTATION',
          project_code_id: quotation.project_code_id,
          client_id: quotation.client_id,
          quotation_id: quotation.id,
          status: 'SENT',
          sent_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (reqErr) throw reqErr;

      // Add signer
      await financeDb.from('esign_signers').insert({
        esign_request_id: createdReq.id,
        name: quotation.client_name || 'Client Authorized Signatory',
        email: 'signatory@client.test',
        signing_order: 1,
        status: 'SENT',
      });

      // Update quote status to SENT
      await financeDb
        .from('quotations')
        .update({ status: 'SENT' })
        .eq('id', quotation.id);

      onUpdated();
      onClose();
    } catch (err: any) {
      alert(`Failed to initiate e-sign: ${err.message}`);
    }
  };

  // Handle Confirm via Override
  const handleConfirmOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideReason.trim()) {
      setOverrideError('Please provide a mandatory reason for manual confirmation override.');
      return;
    }
    setOverrideSaving(true);
    setOverrideError(null);
    try {
      const { error } = await financeDb
        .from('quotations')
        .update({
          status: 'CONFIRMED',
          confirmed_via: 'OVERRIDE',
          override_reason: overrideReason.trim(),
          confirmed_at: new Date().toISOString(),
        })
        .eq('id', quotation.id);

      if (error) throw error;
      onUpdated();
      onClose();
    } catch (err: any) {
      setOverrideError(err.message);
    } finally {
      setOverrideSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSignature className="w-5 h-5 text-emerald-600" />
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              E-Sign &amp; Confirmation: {quotation.quote_number}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs">
          {/* Unsigned Warning Flag */}
          {isUnsigned5Days && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl flex items-center gap-2 text-rose-800 dark:text-rose-200 font-semibold">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
              <span>Flagged: Unsigned for more than 5 days. Consider client follow-up or manual override.</span>
            </div>
          )}

          {/* Quotation Snapshot */}
          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 flex justify-between items-center">
            <div>
              <div className="font-semibold text-slate-900 dark:text-slate-100">
                {quotation.client_name} ({quotation.project_code})
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Total Fee: <strong>{formatINR(quotation.total_prof_fee)}</strong> • Status: {quotation.status}
              </div>
            </div>
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
              v{quotation.version}
            </span>
          </div>

          {/* E-sign request status */}
          {esignReq ? (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-slate-600 dark:text-slate-400">E-Sign Status:</span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                    esignReq.status === 'SIGNED'
                      ? 'bg-emerald-100 text-emerald-800'
                      : esignReq.status === 'DECLINED'
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {esignReq.status}
                </span>
              </div>

              {esignReq.sent_at && (
                <div className="text-[11px] text-slate-500">
                  Dispatched on: {new Date(esignReq.sent_at).toLocaleString('en-IN')}
                </div>
              )}

              {/* Signers Table */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                <div className="bg-slate-50 dark:bg-slate-800 px-3 py-1.5 font-bold text-[10px] uppercase text-slate-400">
                  Signatories ({signers.length})
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {signers.map((s) => (
                    <div key={s.id} className="p-2.5 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{s.name}</div>
                        <div className="text-[10px] text-slate-400">{s.email}</div>
                      </div>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {s.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl text-center space-y-2">
              <p className="text-slate-500 text-xs">
                No active e-sign request initiated for this quotation.
              </p>
              {quotation.status === 'DRAFT' && (
                <button
                  type="button"
                  onClick={handleInitiateEsign}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send for Client E-Signature</span>
                </button>
              )}
            </div>
          )}

          {/* Override Form */}
          {showOverride && (
            <form onSubmit={handleConfirmOverride} className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl space-y-3">
              <div className="font-bold text-amber-900 dark:text-amber-200 text-xs">
                Manual Confirmation Override
              </div>
              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                Rule 7: A quotation becomes CONFIRMED when signed via e-sign, or by override with reason + evidence.
              </p>
              {overrideError && (
                <div className="text-[11px] text-rose-600">{overrideError}</div>
              )}
              <textarea
                rows={2}
                required
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Reason for manual override (e.g. Wet-ink engagement letter signed on physical paper)..."
                className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 rounded text-xs text-slate-900 dark:text-slate-100 focus:outline-emerald-600"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowOverride(false)}
                  className="px-3 py-1 text-slate-600 dark:text-slate-300 hover:underline"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={overrideSaving}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded font-semibold text-xs cursor-pointer"
                >
                  {overrideSaving ? 'Confirming...' : 'Confirm via Override'}
                </button>
              </div>
            </form>
          )}

          {/* Action Footer */}
          {!showOverride && quotation.status !== 'CONFIRMED' && (
            <div className="pt-2 flex justify-between items-center">
              <button
                type="button"
                onClick={() => setShowOverride(true)}
                className="text-xs font-semibold text-amber-600 hover:text-amber-700 dark:text-amber-400 underline cursor-pointer"
              >
                Confirm via Override (Reason Required)
              </button>

              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
export default EsignStatusModal;
