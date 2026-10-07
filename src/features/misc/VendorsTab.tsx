// src/features/misc/VendorsTab.tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PlusCircle, Search, Building2, Phone, Mail, CheckCircle2, X } from 'lucide-react';
import { financeDb, coreDb } from '../../lib/supabase';
import { getStoredUser } from '../../lib/auth';
import type { Vendor } from '../../lib/types';

export default function VendorsTab() {
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  const { data: vendors = [], isLoading, refetch } = useQuery({
    queryKey: ['vendors-directory'],
    queryFn: async () => {
      const { data, error } = await financeDb
        .from('vendors')
        .select('*')
        .order('name');
      if (error) throw error;
      return (data || []) as Vendor[];
    }
  });

  const filtered = vendors.filter(v => {
    const q = search.toLowerCase();
    return (
      v.name.toLowerCase().includes(q) ||
      (v.contact_person && v.contact_person.toLowerCase().includes(q)) ||
      (v.email && v.email.toLowerCase().includes(q)) ||
      (v.gstin && v.gstin.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-slate-900">External Vendors Directory</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Registered translation agencies, search partners, patent drawing illustrators, and notaries
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition"
        >
          <PlusCircle className="w-4 h-4" />
          Add External Vendor
        </button>
      </div>

      <div className="relative w-full sm:w-80">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by vendor name, GSTIN..."
          className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Loading vendors...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">No vendors found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/75 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">Vendor Name</th>
                  <th className="px-5 py-3.5">Contact Person</th>
                  <th className="px-5 py-3.5">Contact Info</th>
                  <th className="px-5 py-3.5">GSTIN / PAN</th>
                  <th className="px-5 py-3.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filtered.map(v => (
                  <tr key={v.id} className="hover:bg-slate-50/60 transition">
                    <td className="px-5 py-4 font-semibold text-slate-900">{v.name}</td>
                    <td className="px-5 py-4 text-slate-700">{v.contact_person || '—'}</td>
                    <td className="px-5 py-4 text-xs space-y-0.5 text-slate-600">
                      {v.email && <div className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-slate-400" /> {v.email}</div>}
                      {v.phone && <div className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-slate-400" /> {v.phone}</div>}
                      {!v.email && !v.phone && '—'}
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-slate-700">
                      {v.gstin ? <div>GSTIN: {v.gstin}</div> : null}
                      {v.pan ? <div>PAN: {v.pan}</div> : null}
                      {!v.gstin && !v.pan && '—'}
                    </td>
                    <td className="px-5 py-4 text-center">
                      {v.active ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
                          <CheckCircle2 className="w-3 h-3" /> Active
                        </span>
                      ) : (
                        <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-semibold">
                          Inactive
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAddModal && (
        <NewVendorModal
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

function NewVendorModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      setLoading(true);
      const user = getStoredUser();

      const { error } = await financeDb.from('vendors').insert({
        name: name.trim(),
        contact_person: contactPerson.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        gstin: gstin.trim().toUpperCase() || null,
        pan: pan.trim().toUpperCase() || null,
        active: true,
        created_by: user?.id
      });

      if (error) throw error;
      onSuccess();
    } catch (err: any) {
      alert(err.message || 'Failed to add vendor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-3xl shadow-xl border border-slate-200 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900">Add External Vendor</h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Vendor Agency / Firm Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Person</label>
            <input
              type="text"
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">GSTIN</label>
              <input
                type="text"
                value={gstin}
                onChange={(e) => setGstin(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono uppercase bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">PAN</label>
              <input
                type="text"
                value={pan}
                onChange={(e) => setPan(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono uppercase bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
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
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl"
            >
              {loading ? 'Adding...' : 'Save Vendor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
