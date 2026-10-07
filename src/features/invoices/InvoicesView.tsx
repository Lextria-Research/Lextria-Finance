// src/features/invoices/InvoicesView.tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { 
  FileText, Search, PlusCircle, CreditCard, ChevronRight, X, 
  CheckCircle2, Clock, AlertCircle, ArrowUpRight
} from 'lucide-react';
import { financeDb } from '../../lib/supabase';
import { formatINR } from '../../lib/currency';
import { formatDate } from '../../lib/clock';
import type { InvoiceRef } from '../../lib/types';

export default function InvoicesView() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OUTSTANDING' | 'PAID'>('ALL');
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRef | null>(null);

  // Fetch invoices with joined client and paid amounts from finance.invoices_view
  const { data: invoices = [], isLoading, refetch } = useQuery({
    queryKey: ['invoices-view'],
    queryFn: async () => {
      const { data, error } = await financeDb
        .from('invoices_view')
        .select('*')
        .order('invoice_date', { ascending: false });
      if (error) throw error;
      return (data || []) as InvoiceRef[];
    }
  });

  // Filter invoices
  const filtered = invoices.filter(inv => {
    const q = search.toLowerCase();
    const matchSearch = 
      (inv.zoho_books_invoice_no?.toLowerCase().includes(q)) ||
      (inv.client_code?.toLowerCase().includes(q)) ||
      (inv.client_name?.toLowerCase().includes(q));
    
    if (!matchSearch) return false;

    const outstanding = Number(inv.outstanding_amount || 0);
    if (statusFilter === 'OUTSTANDING') return outstanding > 0.01;
    if (statusFilter === 'PAID') return outstanding <= 0.01;
    return true;
  });

  // Total summary metrics
  const totalBilled = invoices.reduce((s, i) => s + Number(i.total_amount || 0), 0);
  const totalPaid = invoices.reduce((s, i) => s + Number(i.paid_amount || 0), 0);
  const totalOutstanding = invoices.reduce((s, i) => s + Number(i.outstanding_amount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
              <FileText className="w-6 h-6" />
            </div>
            Invoices Register
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Recorded Zoho Books tax invoices with real-time collections and milestone tracking
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/invoices/ready"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition"
          >
            <PlusCircle className="w-4 h-4" />
            Ready to Invoice Queue
          </Link>
          <button
            onClick={() => navigate('/payments')}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition"
          >
            <CreditCard className="w-4 h-4" />
            Record Payment
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Invoiced (All Time)</p>
          <p className="text-2xl font-bold text-slate-900 mt-2">{formatINR(totalBilled)}</p>
          <p className="text-xs text-slate-400 mt-1">{invoices.length} total recorded invoices</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Total Received</p>
          <p className="text-2xl font-bold text-emerald-600 mt-2">{formatINR(totalPaid)}</p>
          <p className="text-xs text-emerald-600/70 mt-1">
            {totalBilled > 0 ? ((totalPaid / totalBilled) * 100).toFixed(1) : 0}% collection efficiency
          </p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Outstanding Receivables</p>
          <p className="text-2xl font-bold text-amber-600 mt-2">{formatINR(totalOutstanding)}</p>
          <p className="text-xs text-amber-600/70 mt-1">
            {invoices.filter(i => (i.outstanding_amount || 0) > 0.01).length} pending collection
          </p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by invoice #, client code or name..."
            className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {(['ALL', 'OUTSTANDING', 'PAID'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                statusFilter === tab
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab === 'ALL' ? 'All Invoices' : tab === 'OUTSTANDING' ? 'Outstanding' : 'Fully Paid'}
            </button>
          ))}
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Loading invoices register...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-slate-800">No invoices found</h3>
            <p className="text-xs text-slate-400 mt-1">
              {search ? 'Try adjusting your search query' : 'Go to Ready to Invoice to generate your first invoice'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/75 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">Invoice #</th>
                  <th className="px-5 py-3.5">Date</th>
                  <th className="px-5 py-3.5">Client</th>
                  <th className="px-5 py-3.5 text-right">Prof. Fee</th>
                  <th className="px-5 py-3.5 text-right">GST (18%)</th>
                  <th className="px-5 py-3.5 text-right">Reimb.</th>
                  <th className="px-5 py-3.5 text-right">Total</th>
                  <th className="px-5 py-3.5 text-right">Paid</th>
                  <th className="px-5 py-3.5 text-right">Balance</th>
                  <th className="px-5 py-3.5 text-center">Status</th>
                  <th className="px-5 py-3.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filtered.map(inv => {
                  const outstanding = Number(inv.outstanding_amount || 0);
                  const isPaid = outstanding <= 0.01;
                  const isPartial = !isPaid && Number(inv.paid_amount || 0) > 0.01;

                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/60 transition group">
                      <td className="px-5 py-4 font-mono font-semibold text-slate-900">
                        {inv.zoho_books_invoice_no}
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-500 whitespace-nowrap">
                        {formatDate(inv.invoice_date)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-900">{inv.client_name}</div>
                        <div className="text-xs text-slate-400 font-mono">{inv.client_code}</div>
                      </td>
                      <td className="px-5 py-4 text-right font-mono text-slate-600">
                        {formatINR(inv.professional_taxable)}
                      </td>
                      <td className="px-5 py-4 text-right font-mono text-slate-600">
                        {formatINR(inv.gst_amount)}
                      </td>
                      <td className="px-5 py-4 text-right font-mono text-slate-600">
                        {formatINR(inv.reimbursement_amount)}
                      </td>
                      <td className="px-5 py-4 text-right font-mono font-semibold text-slate-900">
                        {formatINR(inv.total_amount)}
                      </td>
                      <td className="px-5 py-4 text-right font-mono text-emerald-600">
                        {formatINR(inv.paid_amount || 0)}
                      </td>
                      <td className="px-5 py-4 text-right font-mono font-bold text-amber-600">
                        {formatINR(outstanding)}
                      </td>
                      <td className="px-5 py-4 text-center">
                        {isPaid ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                            <CheckCircle2 className="w-3 h-3" /> Paid
                          </span>
                        ) : isPartial ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-700">
                            <Clock className="w-3 h-3" /> Partial
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                            <AlertCircle className="w-3 h-3" /> Unpaid
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => setSelectedInvoice(inv)}
                            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
                            title="View Invoice Details"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                          {!isPaid && (
                            <button
                              onClick={() => navigate('/payments', { state: { prefillInvoice: inv } })}
                              className="px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition"
                            >
                              Collect
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invoice Detail Drawer / Modal */}
      {selectedInvoice && (
        <InvoiceDetailModal 
          invoice={selectedInvoice} 
          onClose={() => setSelectedInvoice(null)} 
          onRefresh={refetch}
        />
      )}
    </div>
  );
}

// Sub-component: Invoice Details with linked stages & costs
function InvoiceDetailModal({ invoice, onClose, onRefresh }: { invoice: InvoiceRef; onClose: () => void; onRefresh: () => void }) {
  const navigate = useNavigate();

  // Fetch linked stages
  const { data: stages = [] } = useQuery({
    queryKey: ['invoice-stages', invoice.id],
    queryFn: async () => {
      const { data, error } = await financeDb
        .from('billing_stages_view')
        .select('*')
        .eq('invoice_ref_id', invoice.id);
      if (error) throw error;
      return data || [];
    }
  });

  // Fetch linked costs
  const { data: costs = [] } = useQuery({
    queryKey: ['invoice-costs', invoice.id],
    queryFn: async () => {
      const { data, error } = await financeDb
        .from('recoverable_costs_view')
        .select('*')
        .eq('recovered_via_invoice_ref_id', invoice.id);
      if (error) throw error;
      return data || [];
    }
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-3xl shadow-xl border border-slate-200 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Invoice Details</div>
            <h2 className="text-xl font-bold font-mono text-slate-900">{invoice.zoho_books_invoice_no}</h2>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          {/* Header Summary */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-slate-400 block">Invoice Date</span>
              <span className="font-semibold text-slate-800">{formatDate(invoice.invoice_date)}</span>
            </div>
            <div>
              <span className="text-slate-400 block">Client</span>
              <span className="font-semibold text-slate-800">{invoice.client_name}</span>
            </div>
            <div>
              <span className="text-slate-400 block">GSTIN</span>
              <span className="font-mono text-slate-800">{invoice.client_gstin || 'N/A'}</span>
            </div>
            <div>
              <span className="text-slate-400 block">State Code</span>
              <span className="font-mono text-slate-800">{invoice.client_state_code || '27'}</span>
            </div>
          </div>

          {/* Amount Breakdown */}
          <div className="border border-slate-200 rounded-2xl p-4 space-y-2 text-sm bg-white">
            <div className="flex justify-between text-slate-600">
              <span>Professional Fees (Taxable)</span>
              <span className="font-mono font-medium">{formatINR(invoice.professional_taxable)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>GST (CGST/SGST or IGST)</span>
              <span className="font-mono font-medium">{formatINR(invoice.gst_amount)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Out-of-Pocket Reimbursements (Pure Agent)</span>
              <span className="font-mono font-medium">{formatINR(invoice.reimbursement_amount)}</span>
            </div>
            <div className="border-t border-slate-200 pt-2 flex justify-between font-bold text-slate-900 text-base">
              <span>Total Invoice Amount</span>
              <span className="font-mono text-emerald-600">{formatINR(invoice.total_amount)}</span>
            </div>
            <div className="border-t border-slate-100 pt-2 flex justify-between text-xs text-slate-500">
              <span>Paid so far: <strong className="text-emerald-600 font-mono">{formatINR(invoice.paid_amount || 0)}</strong></span>
              <span>Outstanding balance: <strong className="text-amber-600 font-mono">{formatINR(invoice.outstanding_amount || 0)}</strong></span>
            </div>
          </div>

          {/* Linked Stages */}
          <div>
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Billed Professional Stages ({stages.length})
            </h4>
            {stages.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No professional milestone stages linked</p>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                {stages.map((st: any) => (
                  <div key={st.id} className="p-3 flex items-center justify-between text-xs bg-white">
                    <div>
                      <div className="font-semibold text-slate-800">{st.name}</div>
                      <div className="text-slate-400 font-mono">{st.project_code} • {st.quote_number}</div>
                    </div>
                    <div className="font-mono font-semibold text-slate-900">
                      {formatINR(st.allocated_amount)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Linked Recoverable Costs */}
          <div>
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Recovered Client Costs ({costs.length})
            </h4>
            {costs.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No reimbursement costs linked to this invoice</p>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                {costs.map((c: any) => (
                  <div key={c.id} className="p-3 flex items-center justify-between text-xs bg-white">
                    <div>
                      <div className="font-semibold text-slate-800">{c.description}</div>
                      <div className="text-slate-400">{c.category} • {formatDate(c.cost_date)}</div>
                    </div>
                    <div className="font-mono font-semibold text-slate-900">
                      {formatINR(c.amount)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {invoice.notes && (
            <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <span className="font-semibold block text-slate-700 mb-1">Notes:</span>
              {invoice.notes}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-200 bg-slate-50/75 flex items-center justify-between">
          <Link
            to={`/ledger?client_id=${invoice.client_id}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
          >
            View Client Ledger <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
            >
              Close
            </button>
            {(invoice.outstanding_amount || 0) > 0.01 && (
              <button
                onClick={() => {
                  onClose();
                  navigate('/payments', { state: { prefillInvoice: invoice } });
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition"
              >
                Record Payment for This Invoice
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
