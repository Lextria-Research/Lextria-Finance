// src/features/payments/PaymentsView.tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { 
  CreditCard, Search, PlusCircle, Wallet, ArrowDownLeft,
  Calendar, CheckCircle2, ChevronRight, Filter
} from 'lucide-react';
import { financeDb } from '../../lib/supabase';
import { formatINR } from '../../lib/currency';
import { formatDate } from '../../lib/clock';
import RecordPaymentModal from './RecordPaymentModal';
import AdvancesTab from './AdvancesTab';
import type { Payment, InvoiceRef } from '../../lib/types';

export default function PaymentsView() {
  const location = useLocation();
  const prefillInvoice = (location.state as any)?.prefillInvoice as InvoiceRef | undefined;

  const [activeTab, setActiveTab] = useState<'PAYMENTS' | 'ADVANCES'>('PAYMENTS');
  const [search, setSearch] = useState('');
  const [showRecordModal, setShowRecordModal] = useState(!!prefillInvoice);

  // Fetch payments list with client
  const { data: payments = [], isLoading, refetch } = useQuery({
    queryKey: ['payments-list'],
    queryFn: async () => {
      const { data, error } = await financeDb
        .from('payments')
        .select(`
          *,
          client:client_id (
            client_code,
            client_name
          ),
          allocations:payment_allocations (
            id,
            amount,
            invoice_ref_id
          )
        `)
        .order('received_date', { ascending: false });
      if (error) throw error;

      return (data || []).map((p: any) => ({
        ...p,
        client_code: p.client?.client_code,
        client_name: p.client?.client_name,
        allocations_count: p.allocations?.length || 0
      })) as (Payment & { client_code?: string; client_name?: string; allocations_count: number })[];
    }
  });

  const filtered = payments.filter(p => {
    const q = search.toLowerCase();
    return (
      p.client_code?.toLowerCase().includes(q) ||
      p.client_name?.toLowerCase().includes(q) ||
      p.reference?.toLowerCase().includes(q) ||
      p.mode?.toLowerCase().includes(q)
    );
  });

  const totalGross = payments.reduce((s, p) => s + Number(p.gross_amount || 0), 0);
  const totalTds = payments.reduce((s, p) => s + Number(p.tds_amount || 0), 0);
  const totalNet = payments.reduce((s, p) => s + Number(p.net_amount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
              <CreditCard className="w-6 h-6" />
            </div>
            Payments & Collections
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Bank remittance receipts, TDS deductions, client retainers, and invoice settlements
          </p>
        </div>

        <button
          onClick={() => setShowRecordModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition"
        >
          <PlusCircle className="w-4 h-4" />
          Record Inward Payment
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Gross Collections</p>
          <p className="text-2xl font-bold text-slate-900 mt-2">{formatINR(totalGross)}</p>
          <p className="text-xs text-slate-400 mt-1">{payments.length} inward payment receipts</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Net Bank Inflow</p>
          <p className="text-2xl font-bold text-emerald-600 mt-2">{formatINR(totalNet)}</p>
          <p className="text-xs text-emerald-600/70 mt-1">Realized into current accounts</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-sky-600 uppercase tracking-wider">TDS Claimable (Form 26AS)</p>
          <p className="text-2xl font-bold text-sky-600 mt-2">{formatINR(totalTds)}</p>
          <p className="text-xs text-sky-600/70 mt-1">Withheld by clients under Section 194J</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('PAYMENTS')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'PAYMENTS'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <ArrowDownLeft className="w-4 h-4" />
          Recorded Inward Payments ({payments.length})
        </button>
        <button
          onClick={() => setActiveTab('ADVANCES')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'ADVANCES'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Wallet className="w-4 h-4" />
          Client Advances & Retainers
        </button>
      </div>

      {activeTab === 'ADVANCES' ? (
        <AdvancesTab />
      ) : (
        <div className="space-y-4">
          {/* Search bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by client, reference UTR, mode..."
                className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Payments Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {isLoading ? (
              <div className="p-12 text-center text-slate-400 text-sm">Loading payments...</div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center">
                <CreditCard className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-slate-800">No payment records found</h3>
                <p className="text-xs text-slate-400 mt-1">Click "Record Inward Payment" to log your first payment</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50/75 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-5 py-3.5">Received Date</th>
                      <th className="px-5 py-3.5">Client</th>
                      <th className="px-5 py-3.5">Mode & Reference</th>
                      <th className="px-5 py-3.5 text-right">Gross Amount</th>
                      <th className="px-5 py-3.5 text-right">TDS (194J)</th>
                      <th className="px-5 py-3.5 text-right">Net Received</th>
                      <th className="px-5 py-3.5 text-center">Allocations</th>
                      <th className="px-5 py-3.5">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filtered.map(p => (
                      <tr key={p.id} className="hover:bg-slate-50/60 transition">
                        <td className="px-5 py-4 text-xs font-medium text-slate-600 whitespace-nowrap">
                          {formatDate(p.received_date)}
                        </td>
                        <td className="px-5 py-4">
                          <div className="font-semibold text-slate-900">{p.client_name}</div>
                          <div className="text-xs text-slate-400 font-mono">{p.client_code}</div>
                        </td>
                        <td className="px-5 py-4">
                          <span className="inline-block px-2 py-0.5 text-xs font-semibold bg-slate-100 text-slate-700 rounded-md mr-2">
                            {p.mode}
                          </span>
                          <span className="font-mono text-xs text-slate-600">
                            {p.reference || '—'}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right font-mono font-semibold text-slate-900">
                          {formatINR(p.gross_amount)}
                        </td>
                        <td className="px-5 py-4 text-right font-mono text-sky-700">
                          {Number(p.tds_amount) > 0 ? formatINR(p.tds_amount) : '—'}
                        </td>
                        <td className="px-5 py-4 text-right font-mono font-bold text-emerald-600">
                          {formatINR(p.net_amount)}
                        </td>
                        <td className="px-5 py-4 text-center">
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            {p.allocations_count} invoice{p.allocations_count === 1 ? '' : 's'}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-xs text-slate-500 max-w-xs truncate">
                          {p.notes || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {showRecordModal && (
        <RecordPaymentModal
          onClose={() => setShowRecordModal(false)}
          onSuccess={() => {
            setShowRecordModal(false);
            refetch();
          }}
          prefillInvoice={prefillInvoice}
        />
      )}
    </div>
  );
}
