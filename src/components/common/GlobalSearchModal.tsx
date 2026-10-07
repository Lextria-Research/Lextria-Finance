// src/components/common/GlobalSearchModal.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, FileText, Receipt, ArrowRight, FolderKanban } from 'lucide-react';
import { coreDb, financeDb, isSupabaseConfigured } from '../../lib/supabase';
import { formatINR } from '../../lib/currency';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [clients, setClients] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [quotations, setQuotations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setClients([]);
      setInvoices([]);
      setQuotations([]);
      return;
    }

    const timer = setTimeout(async () => {
      const q = query.trim();
      if (q.length >= 2 && isSupabaseConfigured) {
        setLoading(true);
        try {
          const [clientsRes, invRes, quoteRes] = await Promise.all([
            coreDb
              .from('clients')
              .select('id, client_code, client_name')
              .or(`client_code.ilike.%${q}%,client_name.ilike.%${q}%`)
              .limit(5),
            financeDb
              .from('invoice_refs')
              .select('id, zoho_books_invoice_no, invoice_date, total_amount, client_id')
              .ilike('zoho_books_invoice_no', `%${q}%`)
              .limit(5),
            financeDb
              .from('quotations')
              .select('id, quote_number, status, total_prof_fee, client_id')
              .ilike('quote_number', `%${q}%`)
              .limit(5),
          ]);

          setClients(clientsRes.data || []);
          setInvoices(invRes.data || []);
          setQuotations(quoteRes.data || []);
        } catch (e) {
          console.error('Search error:', e);
        } finally {
          setLoading(false);
        }
      } else {
        setClients([]);
        setInvoices([]);
        setQuotations([]);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <Search className="w-5 h-5 text-emerald-500 mr-3 shrink-0" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clients, project codes, Zoho invoice #, quotations..."
            className="w-full bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
          />
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Results Body */}
        <div className="max-h-96 overflow-y-auto p-4 space-y-4">
          {loading && (
            <div className="py-8 text-center text-xs text-slate-400">Searching financial records...</div>
          )}

          {!loading && query.trim().length < 2 && (
            <div className="py-8 text-center text-xs text-slate-400">
              Type at least 2 characters to search across clients, invoices, and quotations.
            </div>
          )}

          {!loading && query.trim().length >= 2 && clients.length === 0 && invoices.length === 0 && quotations.length === 0 && (
            <div className="py-8 text-center text-xs text-slate-400">
              No matching records found for "{query}".
            </div>
          )}

          {/* Clients */}
          {clients.length > 0 && (
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <FolderKanban className="w-3.5 h-3.5 text-emerald-500" />
                Clients ({clients.length})
              </div>
              <div className="space-y-1.5">
                {clients.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => {
                      onClose();
                      navigate(`/clients?client_id=${c.id}`);
                    }}
                    className="p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer flex items-center justify-between group transition"
                  >
                    <div>
                      <div className="font-semibold text-xs text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <span className="font-mono bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded text-[10px]">
                          {c.client_code}
                        </span>
                        <span>{c.client_name}</span>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-600 transition" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Invoices */}
          {invoices.length > 0 && (
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5 text-emerald-500" />
                Invoices ({invoices.length})
              </div>
              <div className="space-y-1.5">
                {invoices.map((inv) => (
                  <div
                    key={inv.id}
                    onClick={() => {
                      onClose();
                      navigate('/invoices');
                    }}
                    className="p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer flex items-center justify-between group transition"
                  >
                    <div>
                      <div className="font-semibold text-xs text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <span className="font-mono">{inv.zoho_books_invoice_no}</span>
                        <span className="text-[11px] text-slate-500">
                          {formatINR(inv.total_amount)}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Dated: {inv.invoice_date}
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-600 transition" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quotations */}
          {quotations.length > 0 && (
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-emerald-500" />
                Quotations ({quotations.length})
              </div>
              <div className="space-y-1.5">
                {quotations.map((q) => (
                  <div
                    key={q.id}
                    onClick={() => {
                      onClose();
                      navigate('/quotations');
                    }}
                    className="p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer flex items-center justify-between group transition"
                  >
                    <div>
                      <div className="font-semibold text-xs text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <span className="font-mono">{q.quote_number}</span>
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {q.status}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Fee: {formatINR(q.total_prof_fee)}
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-600 transition" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
