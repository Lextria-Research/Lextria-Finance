// src/features/clients/ClientsView.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Users,
  Search,
  Plus,
  ArrowRight,
  BookOpen,
  Building,
  DollarSign,
  FolderKanban,
  FileText,
  Clock,
} from 'lucide-react';
import { coreDb, financeDb, isSupabaseConfigured } from '../../lib/supabase';
import { formatINR } from '../../lib/currency';
import { NewClientModal } from './NewClientModal';

export const ClientsView: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const selectedClientIdParam = searchParams.get('client_id');

  const [clients, setClients] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<any | null>(null);
  const [clientMatters, setClientMatters] = useState<any[]>([]);
  const [clientInvoices, setClientInvoices] = useState<any[]>([]);
  const [clientQuotes, setClientQuotes] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchClients = async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await coreDb
        .from('clients')
        .select('*')
        .order('client_name', { ascending: true });

      if (!error && data) {
        setClients(data);
        if (selectedClientIdParam) {
          const match = data.find((c) => c.id === selectedClientIdParam);
          if (match) setSelectedClient(match);
        } else if (data.length > 0 && !selectedClient) {
          setSelectedClient(data[0]);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, [selectedClientIdParam]);

  // When a client is selected, load matters, quotations and invoices
  useEffect(() => {
    if (!selectedClient || !isSupabaseConfigured) return;

    const loadClientDetails = async () => {
      try {
        const [mattersRes, invRes, quoteRes] = await Promise.all([
          coreDb
            .from('project_codes')
            .select('*')
            .eq('client_id', selectedClient.id)
            .order('created_at', { ascending: false }),
          financeDb
            .from('invoices_view')
            .select('*')
            .eq('client_id', selectedClient.id)
            .order('invoice_date', { ascending: false }),
          financeDb
            .from('quotations_view')
            .select('*')
            .eq('client_id', selectedClient.id)
            .order('created_at', { ascending: false }),
        ]);

        setClientMatters(mattersRes.data || []);
        setClientInvoices(invRes.data || []);
        setClientQuotes(quoteRes.data || []);
      } catch (e) {
        console.error(e);
      }
    };

    loadClientDetails();
  }, [selectedClient]);

  const filteredClients = clients.filter(
    (c) =>
      c.client_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.client_code?.toLowerCase().includes(search.toLowerCase()) ||
      c.gstin?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-emerald-600" />
            <span>Clients &amp; Matters Register</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Client directory, billing profiles, matter mappings, and ledger balances.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs shadow-emerald-600/30 transition cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>New Client &amp; Matter</span>
        </button>
      </div>

      {/* Main Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Client List (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by code, client name, GSTIN..."
              className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-900 dark:text-slate-100 focus:outline-emerald-600"
            />
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-400 flex justify-between">
              <span>Clients ({filteredClients.length})</span>
              <span>Code</span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[600px] overflow-y-auto">
              {filteredClients.map((c) => {
                const isSelected = selectedClient?.id === c.id;
                return (
                  <div
                    key={c.id}
                    onClick={() => setSelectedClient(c)}
                    className={`p-3.5 cursor-pointer transition flex items-center justify-between text-xs ${
                      isSelected
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-l-4 border-emerald-600'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {c.client_name}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                        <span>{c.entity_type?.replace(/_/g, ' ')}</span>
                        {c.state_code && <span>• State: {c.state_code}</span>}
                      </div>
                    </div>
                    <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {c.client_code}
                    </span>
                  </div>
                );
              })}

              {filteredClients.length === 0 && (
                <div className="py-8 text-center text-xs text-slate-400 italic">
                  No clients match "{search}".
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Selected Client Profile & Matters Drill-down (7 cols) */}
        <div className="lg:col-span-7">
          {selectedClient ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-2xs space-y-6">
              {/* Client Header & Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      {selectedClient.client_code}
                    </span>
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      {selectedClient.client_name}
                    </h2>
                  </div>
                  <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                    {selectedClient.gstin && <span>GSTIN: <strong className="font-mono">{selectedClient.gstin}</strong></span>}
                    {selectedClient.pan && <span>PAN: <strong className="font-mono">{selectedClient.pan}</strong></span>}
                    {selectedClient.email && <span>{selectedClient.email}</span>}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => navigate(`/ledger?client_id=${selectedClient.id}`)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg text-xs font-semibold text-emerald-700 dark:text-emerald-400 transition cursor-pointer self-start sm:self-auto"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>View Statement / Ledger</span>
                </button>
              </div>

              {/* Matters / Project Codes Associated */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-xs uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <FolderKanban className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Associated Matters ({clientMatters.length})</span>
                  </h3>
                </div>

                {clientMatters.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400 italic bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-dashed border-slate-200 dark:border-slate-800">
                    No project codes linked yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {clientMatters.map((m) => (
                      <div
                        key={m.id}
                        className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-lg flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                            <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                              {m.code}
                            </span>
                            <span>{m.title}</span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Dept: {m.department} • Status: {m.status}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Invoices Raised for this Client */}
              <div>
                <h3 className="font-bold text-xs uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-blue-500" />
                  <span>Recent Invoices ({clientInvoices.length})</span>
                </h3>

                {clientInvoices.length === 0 ? (
                  <div className="py-4 text-center text-xs text-slate-400 italic">
                    No invoices recorded for this client.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {clientInvoices.slice(0, 4).map((inv) => (
                      <div
                        key={inv.id}
                        className="p-2.5 bg-slate-50 dark:bg-slate-800/40 rounded border border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs"
                      >
                        <div>
                          <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                            #{inv.zoho_books_invoice_no}
                          </span>
                          <span className="text-[11px] text-slate-400 ml-2">
                            {inv.invoice_date}
                          </span>
                        </div>
                        <div className="font-bold text-slate-900 dark:text-slate-100">
                          {formatINR(inv.total_amount)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="py-16 text-center text-xs text-slate-400 italic bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
              Select a client from the left directory to view matters and profile.
            </div>
          )}
        </div>
      </div>

      {/* New Client Modal */}
      <NewClientModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreated={() => {
          fetchClients();
        }}
      />
    </div>
  );
};
export default ClientsView;
