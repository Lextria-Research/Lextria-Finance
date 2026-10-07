// src/features/misc/MiscJobsView.tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Briefcase, PlusCircle, Search, Calendar, AlertTriangle, 
  CheckCircle2, Clock, DollarSign, Filter, LayoutGrid, List,
  ArrowRight, ShieldCheck, FileCheck
} from 'lucide-react';
import { financeDb, coreDb } from '../../lib/supabase';
import { formatINR } from '../../lib/currency';
import { formatDate, todayDateStr } from '../../lib/clock';
import { getStoredUser } from '../../lib/auth';
import NewMiscJobModal from './NewMiscJobModal';
import VendorsTab from './VendorsTab';
import type { MiscJob } from '../../lib/types';

export default function MiscJobsView() {
  const [activeTab, setActiveTab] = useState<'JOBS' | 'VENDORS'>('JOBS');
  const [viewMode, setViewMode] = useState<'LIST' | 'KANBAN'>('LIST');
  const [search, setSearch] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [billModalJob, setBillModalJob] = useState<MiscJob | null>(null);
  const [vendorBillNo, setVendorBillNo] = useState('');
  const [vendorBillDate, setVendorBillDate] = useState(todayDateStr());
  const [payModalJob, setPayModalJob] = useState<MiscJob | null>(null);
  const [vendorTds, setVendorTds] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);

  // Fetch misc jobs from view
  const { data: jobs = [], isLoading, refetch } = useQuery({
    queryKey: ['misc-jobs-view'],
    queryFn: async () => {
      const { data, error } = await financeDb
        .from('misc_jobs_view')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as MiscJob[];
    }
  });

  const filtered = jobs.filter(j => {
    const q = search.toLowerCase();
    return (
      j.description.toLowerCase().includes(q) ||
      j.work_type.toLowerCase().includes(q) ||
      j.project_code?.toLowerCase().includes(q) ||
      j.client_name?.toLowerCase().includes(q) ||
      (j.vendor_name && j.vendor_name.toLowerCase().includes(q))
    );
  });

  // Overdue check
  const isOverdue = (dateStr?: string | null) => {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date();
  };

  // Mark Completed & Write MISC_COMPLETED event to core.matter_events
  const handleMarkCompleted = async (job: MiscJob) => {
    try {
      setIsProcessing(true);
      const user = getStoredUser();

      // 1. Update misc_jobs status to COMPLETED
      const { error: jobErr } = await financeDb
        .from('misc_jobs')
        .update({ status: 'COMPLETED' })
        .eq('id', job.id);
      if (jobErr) throw jobErr;

      // 2. Write matching core.matter_events row
      const { error: evtErr } = await coreDb
        .from('matter_events')
        .insert({
          project_code_id: job.project_code_id,
          event_code: 'MISC_COMPLETED',
          title: `Misc Job Completed: ${job.work_type}`,
          detail: `Vendor job completed: ${job.description}`,
          occurred_at: new Date().toISOString(),
          actor_user_id: user?.id,
          source_app: 'FINANCE',
          client_visible: true,
          client_label: 'Ancillary Work Completed'
        });
      if (evtErr) console.warn('Failed to insert matter event:', evtErr);

      refetch();
    } catch (err: any) {
      alert(err.message || 'Failed to complete job');
    } finally {
      setIsProcessing(false);
    }
  };

  // Record Vendor Bill
  const handleSaveVendorBill = async () => {
    if (!billModalJob || !vendorBillNo.trim()) return;

    try {
      setIsProcessing(true);
      const { error } = await financeDb
        .from('misc_jobs')
        .update({
          vendor_bill_no: vendorBillNo.trim(),
          vendor_bill_date: vendorBillDate
        })
        .eq('id', billModalJob.id);
      if (error) throw error;

      setBillModalJob(null);
      setVendorBillNo('');
      refetch();
    } catch (err: any) {
      alert(err.message || 'Failed to save bill');
    } finally {
      setIsProcessing(false);
    }
  };

  // Mark Vendor Paid
  const handlePayVendor = async () => {
    if (!payModalJob) return;

    if (!payModalJob.vendor_bill_no) {
      alert('Strict Rule: A valid vendor bill number must be entered before marking vendor payment as PAID.');
      return;
    }

    try {
      setIsProcessing(true);
      const { error } = await financeDb
        .from('misc_jobs')
        .update({
          vendor_payment_status: 'PAID',
          vendor_paid_date: new Date().toISOString().split('T')[0],
          vendor_tds: vendorTds
        })
        .eq('id', payModalJob.id);
      if (error) throw error;

      setPayModalJob(null);
      setVendorTds(0);
      refetch();
    } catch (err: any) {
      alert(err.message || 'Failed to update vendor payment');
    } finally {
      setIsProcessing(false);
    }
  };

  // Metrics
  const totalCharged = jobs.reduce((s, j) => s + Number(j.amount_charged || 0), 0);
  const totalCost = jobs.reduce((s, j) => s + Number(j.vendor_cost || 0), 0);
  const totalMargin = totalCharged - totalCost;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
              <Briefcase className="w-6 h-6" />
            </div>
            Misc & Vendor Jobs
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Outsourced translations, searches, notaries, margin tracking, and vendor disbursements
          </p>
        </div>

        <button
          onClick={() => setShowNewModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition"
        >
          <PlusCircle className="w-4 h-4" />
          Create Misc Job
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Client Billed</p>
          <p className="text-2xl font-bold text-slate-900 mt-2">{formatINR(totalCharged)}</p>
          <p className="text-xs text-slate-400 mt-1">{jobs.length} jobs contracted</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-rose-600 uppercase tracking-wider">Vendor Cost Outlay</p>
          <p className="text-2xl font-bold text-rose-600 mt-2">{formatINR(totalCost)}</p>
          <p className="text-xs text-rose-600/70 mt-1">Payable to external vendors</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Firm Gross Margin</p>
          <p className="text-2xl font-bold text-emerald-600 mt-2">{formatINR(totalMargin)}</p>
          <p className="text-xs text-emerald-600/70 mt-1">
            {totalCharged > 0 ? ((totalMargin / totalCharged) * 100).toFixed(1) : 0}% retained profit margin
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 justify-between items-center">
        <div className="flex">
          <button
            onClick={() => setActiveTab('JOBS')}
            className={`px-5 py-3 text-sm font-semibold border-b-2 transition flex items-center gap-2 ${
              activeTab === 'JOBS'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            Jobs Queue ({jobs.length})
          </button>
          <button
            onClick={() => setActiveTab('VENDORS')}
            className={`px-5 py-3 text-sm font-semibold border-b-2 transition flex items-center gap-2 ${
              activeTab === 'VENDORS'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Vendors Directory
          </button>
        </div>

        {activeTab === 'JOBS' && (
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setViewMode('LIST')}
              className={`p-1.5 rounded-lg text-xs font-semibold transition ${
                viewMode === 'LIST' ? 'bg-white shadow-xs text-slate-900' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('KANBAN')}
              className={`p-1.5 rounded-lg text-xs font-semibold transition ${
                viewMode === 'KANBAN' ? 'bg-white shadow-xs text-slate-900' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {activeTab === 'VENDORS' ? (
        <VendorsTab />
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
                placeholder="Search job, matter, vendor..."
                className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* List or Kanban */}
          {viewMode === 'LIST' ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              {isLoading ? (
                <div className="p-12 text-center text-slate-400 text-sm">Loading jobs...</div>
              ) : filtered.length === 0 ? (
                <div className="p-12 text-center">
                  <Briefcase className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <h3 className="text-sm font-semibold text-slate-800">No misc jobs found</h3>
                  <p className="text-xs text-slate-400 mt-1">Create a vendor or search assignment to track</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50/75 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      <tr>
                        <th className="px-5 py-3.5">Matter & Client</th>
                        <th className="px-5 py-3.5">Work Type & Description</th>
                        <th className="px-5 py-3.5">Vendor</th>
                        <th className="px-5 py-3.5">Due Date</th>
                        <th className="px-5 py-3.5 text-right">Fee (₹)</th>
                        <th className="px-5 py-3.5 text-right">Cost (₹)</th>
                        <th className="px-5 py-3.5 text-right">Margin</th>
                        <th className="px-5 py-3.5 text-center">Status</th>
                        <th className="px-5 py-3.5 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {filtered.map(j => {
                        const overdue = isOverdue(j.statutory_due_date);
                        const isDone = j.status === 'COMPLETED' || j.status === 'DELIVERED_TO_CLIENT';

                        return (
                          <tr key={j.id} className="hover:bg-slate-50/60 transition">
                            <td className="px-5 py-4">
                              <div className="font-mono font-bold text-slate-900">{j.project_code}</div>
                              <div className="text-xs text-slate-500">{j.client_name}</div>
                            </td>
                            <td className="px-5 py-4 max-w-xs">
                              <div className="font-semibold text-slate-800">{j.work_type}</div>
                              <div className="text-xs text-slate-500 truncate">{j.description}</div>
                            </td>
                            <td className="px-5 py-4 text-xs font-medium text-slate-700">
                              {j.vendor_name || <span className="text-slate-400 italic">Direct Firm Staff</span>}
                            </td>
                            <td className="px-5 py-4 text-xs whitespace-nowrap">
                              {j.statutory_due_date ? (
                                <div className={overdue && !isDone ? 'text-rose-600 font-bold flex items-center gap-1' : 'text-slate-600'}>
                                  {overdue && !isDone && <AlertTriangle className="w-3.5 h-3.5" />}
                                  Statutory: {formatDate(j.statutory_due_date)}
                                </div>
                              ) : null}
                              {j.client_due_date && (
                                <div className="text-[11px] text-slate-400">Client: {formatDate(j.client_due_date)}</div>
                              )}
                              {!j.statutory_due_date && !j.client_due_date && '—'}
                            </td>
                            <td className="px-5 py-4 text-right font-mono font-semibold text-slate-900">
                              {formatINR(j.amount_charged)}
                            </td>
                            <td className="px-5 py-4 text-right font-mono text-rose-600">
                              {formatINR(j.vendor_cost)}
                            </td>
                            <td className="px-5 py-4 text-right font-mono font-bold text-emerald-600">
                              {formatINR(j.margin_amount || 0)}
                            </td>
                            <td className="px-5 py-4 text-center">
                              <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                                isDone ? 'bg-emerald-100 text-emerald-800' :
                                j.status === 'IN_PROGRESS' ? 'bg-sky-100 text-sky-800' :
                                'bg-slate-100 text-slate-700'
                              }`}>
                                {isDone && <CheckCircle2 className="w-3 h-3" />}
                                {j.status}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                {!isDone && (
                                  <button
                                    onClick={() => handleMarkCompleted(j)}
                                    disabled={isProcessing}
                                    className="px-2 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition"
                                    title="Mark Completed & Write Matter Event"
                                  >
                                    Done
                                  </button>
                                )}
                                {!j.vendor_bill_no && Number(j.vendor_cost) > 0 && (
                                  <button
                                    onClick={() => setBillModalJob(j)}
                                    className="px-2 py-1 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                                  >
                                    Add Bill #
                                  </button>
                                )}
                                {j.vendor_payment_status === 'UNPAID' && Number(j.vendor_cost) > 0 && (
                                  <button
                                    onClick={() => setPayModalJob(j)}
                                    className="px-2 py-1 text-xs font-semibold text-white bg-slate-900 hover:bg-black rounded-lg transition"
                                  >
                                    Pay Vendor
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
          ) : (
            /* Kanban View */
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {(['RECEIVED', 'IN_PROGRESS', 'AWAITING_CLIENT_DOCS', 'COMPLETED'] as const).map(col => {
                const colJobs = filtered.filter(j => j.status === col);

                return (
                  <div key={col} className="bg-slate-50/70 p-3 rounded-2xl border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between px-1">
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">{col}</h4>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-mono font-bold">
                        {colJobs.length}
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {colJobs.map(j => (
                        <div key={j.id} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs space-y-2">
                          <div className="flex justify-between items-start">
                            <span className="font-mono text-xs font-bold text-slate-900">{j.project_code}</span>
                            <span className="font-mono text-xs font-bold text-emerald-600">{formatINR(j.amount_charged)}</span>
                          </div>
                          <div className="text-xs font-semibold text-slate-800">{j.work_type}</div>
                          <p className="text-[11px] text-slate-500 line-clamp-2">{j.description}</p>
                          <div className="text-[11px] text-slate-400">Vendor: {j.vendor_name || 'Direct'}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Vendor Bill Modal */}
      {billModalJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-xl border border-slate-200 max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Record Vendor Bill</h3>
            <p className="text-xs text-slate-500 mb-4">Attach bill invoice number before vendor payment release</p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Vendor Bill / Tax Invoice # *</label>
                <input
                  type="text"
                  value={vendorBillNo}
                  onChange={(e) => setVendorBillNo(e.target.value)}
                  required
                  placeholder="e.g. INV-2026-9281"
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Bill Date *</label>
                <input
                  type="date"
                  value={vendorBillDate}
                  onChange={(e) => setVendorBillDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  onClick={() => setBillModalJob(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveVendorBill}
                  disabled={!vendorBillNo.trim()}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs disabled:opacity-50"
                >
                  Save Bill Info
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pay Vendor Modal */}
      {payModalJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-xl border border-slate-200 max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Confirm Vendor Payment</h3>
            <p className="text-xs text-slate-500 mb-4">
              Payout of {formatINR(payModalJob.vendor_cost)} to {payModalJob.vendor_name || 'Vendor'}
            </p>

            <div className="space-y-3">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                <div>Vendor Bill #: <strong className="font-mono">{payModalJob.vendor_bill_no || 'Missing!'}</strong></div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">TDS Withheld (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={vendorTds || ''}
                  onChange={(e) => setVendorTds(Number(e.target.value))}
                  placeholder="0.00"
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  onClick={() => setPayModalJob(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePayVendor}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs"
                >
                  Mark Paid
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Job Modal */}
      {showNewModal && (
        <NewMiscJobModal
          onClose={() => setShowNewModal(false)}
          onSuccess={() => {
            setShowNewModal(false);
            refetch();
          }}
        />
      )}
    </div>
  );
}
