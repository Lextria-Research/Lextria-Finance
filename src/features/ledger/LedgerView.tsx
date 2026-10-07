// src/features/ledger/LedgerView.tsx
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { 
  BookOpen, Search, Printer, Calendar, Download, Building2,
  FileText, CheckCircle2, ArrowDownLeft, AlertCircle, RefreshCw
} from 'lucide-react';
import { financeDb, coreDb } from '../../lib/supabase';
import { formatINR } from '../../lib/currency';
import { formatDate } from '../../lib/clock';
import type { CoreClient, ClientLedgerEntry } from '../../lib/types';

export default function LedgerView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const preselectedClientId = searchParams.get('client_id') || '';

  const [selectedClientId, setSelectedClientId] = useState(preselectedClientId);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Load clients list
  const { data: clients = [] } = useQuery({
    queryKey: ['core-clients-list'],
    queryFn: async () => {
      const { data, error } = await coreDb
        .from('clients')
        .select('*')
        .order('client_name');
      if (error) throw error;
      return (data || []) as CoreClient[];
    }
  });

  // Selected client object
  const currentClient = clients.find(c => c.id === selectedClientId);

  // Auto select first client if none selected
  useEffect(() => {
    if (!selectedClientId && clients.length > 0) {
      setSelectedClientId(clients[0].id);
    }
  }, [clients, selectedClientId]);

  // Update URL param
  const handleClientChange = (id: string) => {
    setSelectedClientId(id);
    setSearchParams(id ? { client_id: id } : {});
  };

  // Fetch chronological ledger entries for the client from finance.client_ledger
  const { data: entries = [], isLoading, refetch } = useQuery({
    queryKey: ['client-ledger-entries', selectedClientId, fromDate, toDate],
    enabled: !!selectedClientId,
    queryFn: async () => {
      let query = financeDb
        .from('client_ledger')
        .select('*')
        .eq('client_id', selectedClientId)
        .order('line_date', { ascending: true })
        .order('created_at', { ascending: true });

      if (fromDate) query = query.gte('line_date', fromDate);
      if (toDate) query = query.lte('line_date', toDate);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as ClientLedgerEntry[];
    }
  });

  // Total debits and credits
  const totalDebits = entries.reduce((s, e) => s + Number(e.debit || 0), 0);
  const totalCredits = entries.reduce((s, e) => s + Number(e.credit || 0), 0);
  const closingBalance = entries.length > 0 
    ? Number(entries[entries.length - 1].running_balance || 0) 
    : 0;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Screen Header (Hidden on Print) */}
      <div className="print:hidden flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
              <BookOpen className="w-6 h-6" />
            </div>
            Client Statement of Account
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Running account ledger showing invoices, recoverable costs, payments, and real-time net balance
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition border border-slate-200"
            title="Refresh Ledger"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl shadow-xs transition"
          >
            <Printer className="w-4 h-4" />
            Print / Save PDF
          </button>
        </div>
      </div>

      {/* Filter / Client Selection Card (Hidden on Print) */}
      <div className="print:hidden bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex-1 max-w-md">
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Select Client Account</label>
          <select
            value={selectedClientId}
            onChange={(e) => handleClientChange(e.target.value)}
            className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-slate-900"
          >
            {clients.map(c => (
              <option key={c.id} value={c.id}>
                {c.client_name} ({c.client_code})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          {(fromDate || toDate) && (
            <button
              onClick={() => { setFromDate(''); setToDate(''); }}
              className="mt-5 text-xs text-rose-600 font-semibold hover:underline"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* PRINT-FRIENDLY & ON-SCREEN STATEMENT CONTAINER */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-8 print:p-0 print:border-none print:shadow-none space-y-6">
        
        {/* Printable Letterhead Header */}
        <div className="border-b border-slate-200 pb-6 flex justify-between items-start">
          <div>
            <div className="text-xl font-black tracking-tight text-emerald-800">
              LEXTRIA RESEARCH
            </div>
            <p className="text-xs text-slate-500 mt-0.5">Intellectual Property & Corporate Law Practice</p>
            <p className="text-xs text-slate-400 mt-1">
              Registered Office: Mumbai, Maharashtra, India • State Code: 27
            </p>
          </div>

          <div className="text-right">
            <h2 className="text-lg font-bold text-slate-900 tracking-tight uppercase">
              Statement of Account
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 font-mono">
              Generated: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
            {(fromDate || toDate) && (
              <p className="text-[11px] text-slate-400 mt-0.5">
                Period: {fromDate ? formatDate(fromDate) : 'Inception'} to {toDate ? formatDate(toDate) : 'Present'}
              </p>
            )}
          </div>
        </div>

        {/* Client Metadata Card */}
        {currentClient && (
          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-slate-400 font-semibold uppercase tracking-wider block mb-1">Account Holder</span>
              <h3 className="text-base font-bold text-slate-900">{currentClient.client_name}</h3>
              <p className="text-xs text-slate-600 font-mono mt-0.5">Client Code: {currentClient.client_code}</p>
              {currentClient.billing_address && (
                <p className="text-xs text-slate-500 mt-1.5 whitespace-pre-line leading-relaxed">
                  {currentClient.billing_address}
                </p>
              )}
            </div>

            <div className="sm:text-right space-y-1">
              <div>
                <span className="text-slate-400">GSTIN / UIN: </span>
                <span className="font-mono font-semibold text-slate-800">{currentClient.gstin || 'Unregistered'}</span>
              </div>
              <div>
                <span className="text-slate-400">PAN: </span>
                <span className="font-mono font-semibold text-slate-800">{currentClient.pan || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-400">Entity Type: </span>
                <span className="font-medium text-slate-700">{currentClient.entity_type}</span>
              </div>
              <div>
                <span className="text-slate-400">State Code: </span>
                <span className="font-mono font-semibold text-slate-800">{currentClient.state_code || '27'}</span>
              </div>
            </div>
          </div>
        )}

        {/* Financial Summary KPIs */}
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Debits (Billed)</p>
            <p className="text-xl font-bold font-mono text-slate-900 mt-1">{formatINR(totalDebits)}</p>
          </div>
          <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50">
            <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">Total Credits (Paid)</p>
            <p className="text-xl font-bold font-mono text-emerald-700 mt-1">{formatINR(totalCredits)}</p>
          </div>
          <div className="p-4 rounded-2xl border border-emerald-200 bg-emerald-50/40">
            <p className="text-[11px] font-bold text-emerald-950 uppercase tracking-wider">Closing Balance Due</p>
            <p className={`text-xl font-bold font-mono mt-1 ${closingBalance > 0.01 ? 'text-amber-700' : 'text-emerald-800'}`}>
              {formatINR(closingBalance)}
            </p>
          </div>
        </div>

        {/* Statement Line Items Table */}
        <div className="border border-slate-200 rounded-2xl overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center text-slate-400 text-sm">Loading statement ledger...</div>
          ) : entries.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm">
              No transactions recorded for this client in the selected period.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Particulars / Reference</th>
                  <th className="px-4 py-3 text-right">Debit (₹)</th>
                  <th className="px-4 py-3 text-right">Credit (₹)</th>
                  <th className="px-4 py-3 text-right">Balance (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-normal">
                {entries.map((entry, idx) => {
                  const debit = Number(entry.debit || 0);
                  const credit = Number(entry.credit || 0);
                  const running = Number(entry.running_balance || 0);

                  const typeColor = 
                    entry.entry_type === 'INVOICE' ? 'bg-sky-50 text-sky-700 border-sky-200' :
                    entry.entry_type === 'PAYMENT' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                    entry.entry_type === 'RECOVERABLE_COST' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                    'bg-slate-50 text-slate-700 border-slate-200';

                  return (
                    <tr key={entry.id || idx} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-medium whitespace-nowrap text-slate-600">
                        {formatDate(entry.line_date)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded-md border ${typeColor}`}>
                          {entry.entry_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-900 font-medium max-w-md">
                        {entry.description}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-900">
                        {debit > 0 ? formatINR(debit) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-700 font-medium">
                        {credit > 0 ? formatINR(credit) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                        {formatINR(running)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50/80 border-t-2 border-slate-200 font-bold text-slate-900">
                <tr>
                  <td colSpan={3} className="px-4 py-3.5 text-right uppercase text-[11px] text-slate-500">
                    Totals & Net Closing Balance:
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono">{formatINR(totalDebits)}</td>
                  <td className="px-4 py-3.5 text-right font-mono text-emerald-700">{formatINR(totalCredits)}</td>
                  <td className="px-4 py-3.5 text-right font-mono text-emerald-800 text-sm">
                    {formatINR(closingBalance)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* Legal Signoff Footer */}
        <div className="pt-8 border-t border-slate-200 grid grid-cols-2 text-xs text-slate-500">
          <div>
            <p className="font-semibold text-slate-700">Bank Details for Wire Transfer:</p>
            <p className="font-mono mt-0.5">Beneficiary: Lextria Research LLP</p>
            <p className="font-mono">Account No: 00293847291039 • IFSC: HDFC0000291</p>
            <p className="font-mono">Bank: HDFC Bank, Fort Branch, Mumbai</p>
          </div>
          <div className="text-right flex flex-col justify-end">
            <div className="h-10"></div>
            <p className="font-semibold text-slate-800">For LEXTRIA RESEARCH</p>
            <p className="text-[11px] text-slate-400">Authorized Finance Signatory</p>
          </div>
        </div>

      </div>
    </div>
  );
}
