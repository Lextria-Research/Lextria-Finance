// src/features/payments/AdvancesTab.tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PlusCircle, Search, Wallet, CheckCircle2, ArrowRight } from 'lucide-react';
import { financeDb, coreDb } from '../../lib/supabase';
import { formatINR } from '../../lib/currency';
import { formatDate, todayDateStr } from '../../lib/clock';
import type { Advance, CoreClient } from '../../lib/types';

export default function AdvancesTab() {
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // Fetch advances with client info
  const { data: advances = [], isLoading, refetch } = useQuery({
    queryKey: ['client-advances'],
    queryFn: async () => {
      const { data, error } = await financeDb
        .from('advances')
        .select(`
          *,
          client:client_id (
            client_code,
            client_name
          )
        `)
        .order('received_date', { ascending: false });
      if (error) throw error;
      return (data || []).map((a: any) => ({
        ...a,
        client_code: a.client?.client_code,
        client_name: a.client?.client_name
      })) as Advance[];
    }
  });

  const filtered = advances.filter(adv => {
    const q = search.toLowerCase();
    return (
      adv.client_code?.toLowerCase().includes(q) ||
      adv.client_name?.toLowerCase().includes(q) ||
      adv.reference?.toLowerCase().includes(q) ||
      adv.notes?.toLowerCase().includes(q)
    );
  });

  const totalAdvanceHeld = advances.reduce((s, a) => s + (Number(a.amount) - Number(a.allocated_amount || 0)), 0);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-100 text-emerald-800 rounded-xl">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-emerald-950">Active Client Retainers & Advance Funds</h4>
            <p className="text-xs text-emerald-800">
              Total unadjusted advance liability held across all clients: <strong className="font-mono text-emerald-900">{formatINR(totalAdvanceHeld)}</strong>
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition"
        >
          <PlusCircle className="w-4 h-4" />
          Receive Retainer / Advance
        </button>
      </div>

      {/* Search */}
      <div className="relative w-full sm:w-80">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search client code or reference..."
          className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-xs"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Loading client advances...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            No client advances found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/75 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">Received Date</th>
                  <th className="px-5 py-3.5">Client</th>
                  <th className="px-5 py-3.5">Reference #</th>
                  <th className="px-5 py-3.5 text-right">Total Advance</th>
                  <th className="px-5 py-3.5 text-right">Adjusted</th>
                  <th className="px-5 py-3.5 text-right">Available Balance</th>
                  <th className="px-5 py-3.5">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filtered.map(adv => {
                  const bal = Number(adv.amount) - Number(adv.allocated_amount || 0);
                  const isExhausted = bal <= 0.01;

                  return (
                    <tr key={adv.id} className="hover:bg-slate-50/60 transition">
                      <td className="px-5 py-4 text-xs font-medium text-slate-600 whitespace-nowrap">
                        {formatDate(adv.received_date)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-900">{adv.client_name}</div>
                        <div className="text-xs text-slate-400 font-mono">{adv.client_code}</div>
                      </td>
                      <td className="px-5 py-4 font-mono text-xs text-slate-600">
                        {adv.reference || '—'}
                      </td>
                      <td className="px-5 py-4 text-right font-mono font-semibold text-slate-900">
                        {formatINR(adv.amount)}
                      </td>
                      <td className="px-5 py-4 text-right font-mono text-slate-500">
                        {formatINR(adv.allocated_amount || 0)}
                      </td>
                      <td className="px-5 py-4 text-right font-mono font-bold">
                        {isExhausted ? (
                          <span className="text-slate-400">₹0.00 (Exhausted)</span>
                        ) : (
                          <span className="text-emerald-600">{formatINR(bal)}</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-500 max-w-xs truncate">
                        {adv.notes || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Advance Modal */}
      {showAddModal && (
        <NewAdvanceModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            refetch();
          }}
        />
      )}
    </div>
  );
}

function NewAdvanceModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [clientId, setClientId] = useState('');
  const [date, setDate] = useState(todayDateStr());
  const [amount, setAmount] = useState<number>(0);
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId || amount <= 0) return;

    try {
      setLoading(true);
      const { error } = await financeDb.from('advances').insert({
        client_id: clientId,
        received_date: date,
        amount,
        allocated_amount: 0,
        reference: reference.trim() || null,
        notes: notes.trim() || null
      });
      if (error) throw error;
      onSuccess();
    } catch (err: any) {
      alert(err.message || 'Failed to add advance');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-3xl shadow-xl border border-slate-200 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
        <h3 className="text-lg font-bold text-slate-900 mb-1">Receive Client Advance / Retainer</h3>
        <p className="text-xs text-slate-500 mb-5">Record upfront funds received prior to billing</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Client *</label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">-- Select Client --</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.client_name} ({c.client_code})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Amount (₹) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount || ''}
                onChange={(e) => setAmount(Number(e.target.value))}
                required
                className="w-full px-3 py-2 text-sm font-mono font-semibold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Received Date *</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Bank Reference / Cheque #</label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. UTR-098230948"
              className="w-full px-3 py-2 text-sm font-mono bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Purpose of retainer..."
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition"
            >
              {loading ? 'Saving...' : 'Save Advance'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
