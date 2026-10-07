// src/features/dashboard/DashboardView.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  Receipt,
  CreditCard,
  AlertCircle,
  Clock,
  CheckCircle2,
  RefreshCw,
  PlusCircle,
  FileText,
  DollarSign,
  Briefcase,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import { financeDb, coreDb, isSupabaseConfigured } from '../../lib/supabase';
import { formatINR, formatINRShort } from '../../lib/currency';
import { getStoredUser } from '../../lib/auth';

export const DashboardView: React.FC = () => {
  const navigate = useNavigate();
  const user = getStoredUser();

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Financial Metrics State
  const [metrics, setMetrics] = useState({
    quoted: 0,
    workDone: 0,
    workToBeDone: 0,
    unbilled: 0,
    invoiced: 0,
    received: 0,
    outstanding: 0,
    advances: 0,
  });

  // Ageing Breakdown State
  const [ageing, setAgeing] = useState({
    d0_30: 0,
    d31_60: 0,
    d61_90: 0,
    d90_plus: 0,
  });

  const [unbilledStages, setUnbilledStages] = useState<any[]>([]);
  const [unsignedEsigns, setUnsignedEsigns] = useState<any[]>([]);

  const fetchDashboardData = async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // 1. Quoted (CONFIRMED quotations only)
      const { data: quotes } = await financeDb
        .from('quotations')
        .select('total_prof_fee')
        .eq('status', 'CONFIRMED');

      const totalQuoted = (quotes || []).reduce((acc, q) => acc + Number(q.total_prof_fee || 0), 0);

      // 2. Billing Stages (Work Done & Unbilled)
      const { data: stages } = await financeDb
        .from('billing_stages_view')
        .select('*');

      let totalWorkDone = 0;
      let totalUnbilled = 0;
      const unbilledList: any[] = [];

      (stages || []).forEach((s) => {
        const amt = Number(s.allocated_amount || 0);
        if (s.is_completed) {
          totalWorkDone += amt;
          if (s.billing_status === 'UNBILLED_WORK_DONE') {
            totalUnbilled += amt;
            unbilledList.push(s);
          }
        }
      });
      setUnbilledStages(unbilledList.slice(0, 5));

      // 3. Invoices (Invoiced total & Ageing)
      const { data: invoices } = await financeDb
        .from('invoices_view')
        .select('*');

      let totalInvoiced = 0;
      let d0_30 = 0;
      let d31_60 = 0;
      let d61_90 = 0;
      let d90_plus = 0;

      const now = new Date();

      (invoices || []).forEach((inv) => {
        const total = Number(inv.total_amount || 0);
        const outstanding = Number(inv.outstanding_amount || total);
        totalInvoiced += total;

        if (outstanding > 0) {
          const invDate = new Date(inv.invoice_date);
          const diffDays = Math.floor((now.getTime() - invDate.getTime()) / (1000 * 3600 * 24));
          if (diffDays <= 30) d0_30 += outstanding;
          else if (diffDays <= 60) d31_60 += outstanding;
          else if (diffDays <= 90) d61_90 += outstanding;
          else d90_plus += outstanding;
        }
      });

      setAgeing({ d0_30, d31_60, d61_90, d90_plus });

      // 4. Payments (Received)
      const { data: payments } = await financeDb
        .from('payments')
        .select('gross_amount');
      const totalReceived = (payments || []).reduce((acc, p) => acc + Number(p.gross_amount || 0), 0);

      // 5. Advances
      const { data: advances } = await financeDb
        .from('advances')
        .select('amount, allocated_amount');
      const totalAdvances = (advances || []).reduce(
        (acc, a) => acc + Math.max(0, Number(a.amount || 0) - Number(a.allocated_amount || 0)),
        0
      );

      // 6. Outstanding Receivables
      const totalOutstanding = d0_30 + d31_60 + d61_90 + d90_plus;

      setMetrics({
        quoted: totalQuoted,
        workDone: totalWorkDone,
        workToBeDone: Math.max(0, totalQuoted - totalWorkDone),
        unbilled: totalUnbilled,
        invoiced: totalInvoiced,
        received: totalReceived,
        outstanding: totalOutstanding,
        advances: totalAdvances,
      });

      // 7. Unsigned E-signs > 5 days
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString();
      const { data: esigns } = await financeDb
        .from('esign_requests')
        .select('id, document_type, sent_at, client_id, quotation_id')
        .in('status', ['SENT', 'PARTIALLY_SIGNED'])
        .lte('sent_at', fiveDaysAgo);
      setUnsignedEsigns(esigns || []);
    } catch (e) {
      console.error('Failed to load dashboard data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleSyncNow = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const { data, error } = await financeDb.rpc('sync_matter_events_to_billing_stages');
      if (error) {
        setSyncMessage(`Sync failed: ${error.message}`);
      } else {
        const count = typeof data === 'number' ? data : (data?.completed_count ?? 0);
        setSyncMessage(`Sync completed: ${count} stage(s) matched and completed.`);
        fetchDashboardData();
      }
    } catch (err: any) {
      setSyncMessage(`Error: ${err.message}`);
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 5000);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Top Welcome Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
            <span>Finance Overview</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Real-time pipeline: Quoted → Work Done → Zoho Invoicing → Payments &amp; Ageing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSyncNow}
            disabled={syncing}
            className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs shadow-emerald-600/30 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Syncing Timeline...' : 'Sync Now'}</span>
          </button>
        </div>
      </div>

      {syncMessage && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{syncMessage}</span>
        </div>
      )}

      {/* Primary KPI Ribbon (8 Core Metrics) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {/* Quoted */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Quoted (Confirmed)</span>
            <FileText className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 mt-2">
            {formatINR(metrics.quoted)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Confirmed quote fee</div>
        </div>

        {/* Work Done */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Work Done</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-lg sm:text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">
            {formatINR(metrics.workDone)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Completed stages total</div>
        </div>

        {/* Work To Be Done */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Work To Be Done</span>
            <Clock className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-lg sm:text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-2">
            {formatINR(metrics.workToBeDone)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Quoted − Work done</div>
        </div>

        {/* Unbilled Work Done */}
        <div className="bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800/60 rounded-xl p-4 shadow-2xs bg-amber-50/20 dark:bg-amber-950/10">
          <div className="flex items-center justify-between text-amber-700 dark:text-amber-400 text-xs font-semibold">
            <span>Unbilled Work Done</span>
            <AlertCircle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-lg sm:text-xl font-bold text-amber-700 dark:text-amber-400 mt-2">
            {formatINR(metrics.unbilled)}
          </div>
          <div className="text-[11px] text-amber-600/80 mt-1">Ready to invoice now</div>
        </div>

        {/* Invoiced */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Invoiced (Zoho)</span>
            <Receipt className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 mt-2">
            {formatINR(metrics.invoiced)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Total Zoho Books bills</div>
        </div>

        {/* Received */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Received</span>
            <CreditCard className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-lg sm:text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">
            {formatINR(metrics.received)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Gross client receipts</div>
        </div>

        {/* Outstanding Receivables */}
        <div className="bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-900/60 rounded-xl p-4 shadow-2xs bg-rose-50/20 dark:bg-rose-950/10">
          <div className="flex items-center justify-between text-rose-700 dark:text-rose-400 text-xs font-semibold">
            <span>Outstanding Due</span>
            <TrendingUp className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-lg sm:text-xl font-bold text-rose-700 dark:text-rose-400 mt-2">
            {formatINR(metrics.outstanding)}
          </div>
          <div className="text-[11px] text-rose-600/80 mt-1">Debits − Credits</div>
        </div>

        {/* Advances */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Client Advances</span>
            <DollarSign className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-lg sm:text-xl font-bold text-teal-600 dark:text-teal-400 mt-2">
            {formatINR(metrics.advances)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Unallocated balance</div>
        </div>
      </div>

      {/* Receivables Ageing Strip (0–30, 31–60, 61–90, 90+) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-2xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-600" />
              <span>Receivables Ageing Analysis</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Unpaid Zoho invoice balances grouped by days elapsed since invoice date
            </p>
          </div>
          <span className="text-xs font-mono font-semibold text-slate-500">
            Total Overdue: {formatINR(metrics.outstanding)}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 rounded-lg">
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
              0 – 30 Days (Current)
            </div>
            <div className="text-base sm:text-lg font-bold text-emerald-700 dark:text-emerald-300 mt-1">
              {formatINR(ageing.d0_30)}
            </div>
          </div>

          <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 rounded-lg">
            <div className="text-[10px] font-bold uppercase tracking-wider text-blue-800 dark:text-blue-300">
              31 – 60 Days
            </div>
            <div className="text-base sm:text-lg font-bold text-blue-700 dark:text-blue-300 mt-1">
              {formatINR(ageing.d31_60)}
            </div>
          </div>

          <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-lg">
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
              61 – 90 Days
            </div>
            <div className="text-base sm:text-lg font-bold text-amber-700 dark:text-amber-300 mt-1">
              {formatINR(ageing.d61_90)}
            </div>
          </div>

          <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 rounded-lg">
            <div className="text-[10px] font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300">
              90+ Days (Critical)
            </div>
            <div className="text-base sm:text-lg font-bold text-rose-700 dark:text-rose-300 mt-1">
              {formatINR(ageing.d90_plus)}
            </div>
          </div>
        </div>
      </div>

      {/* Two Column Layout: Unbilled Work Done Queue + Action Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Unbilled Work Done Ready to Invoice (2 Cols) */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-amber-500" />
                <span>Ready to Invoice Queue</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Milestones completed by legal/patent staff. Ready to batch into Zoho Books.
              </p>
            </div>
            <button
              onClick={() => navigate('/ready-to-invoice')}
              className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 flex items-center gap-1 cursor-pointer"
            >
              <span>View All ({unbilledStages.length})</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {unbilledStages.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400 italic bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-dashed border-slate-200 dark:border-slate-800">
              No unbilled work pending at this moment.
            </div>
          ) : (
            <div className="space-y-2">
              {unbilledStages.map((s) => (
                <div
                  key={s.id}
                  className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-lg flex items-center justify-between hover:border-emerald-300 transition"
                >
                  <div>
                    <div className="font-semibold text-xs text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <span>{s.name}</span>
                      <span className="font-mono text-[10px] bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-300">
                        {s.project_code}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                      <span>Client: {s.client_name}</span>
                      <span>•</span>
                      <span>Completed: {s.completed_at ? new Date(s.completed_at).toLocaleDateString('en-IN') : 'Recently'}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      {formatINR(s.allocated_amount)}
                    </div>
                    <span className="text-[10px] font-bold uppercase text-amber-600">
                      UNBILLED
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Alerts & Quick Navigations */}
        <div className="space-y-4">
          {/* Unsigned E-signs Flag */}
          {unsignedEsigns.length > 0 && (
            <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-rose-800 dark:text-rose-300 font-bold text-xs">
                <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                <span>E-Sign Flag: Unsigned &gt; 5 Days ({unsignedEsigns.length})</span>
              </div>
              <p className="text-[11px] text-rose-700 dark:text-rose-400">
                Quotations pending client e-sign signature for more than 5 days.
              </p>
              <button
                onClick={() => navigate('/quotations')}
                className="text-xs font-bold text-rose-800 dark:text-rose-300 underline cursor-pointer"
              >
                Inspect pending e-sign requests →
              </button>
            </div>
          )}

          {/* Quick Operations Launchpad */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-2xs space-y-3">
            <h4 className="font-bold text-xs text-slate-900 dark:text-slate-100 uppercase tracking-wider text-slate-400">
              Finance Quick Actions
            </h4>

            <div className="space-y-1.5">
              <button
                onClick={() => navigate('/quotations')}
                className="w-full flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-slate-700 dark:text-slate-300 text-xs font-semibold transition cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-600" />
                  <span>Create New Quotation</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </button>

              <button
                onClick={() => navigate('/ready-to-invoice')}
                className="w-full flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-slate-700 dark:text-slate-300 text-xs font-semibold transition cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-emerald-600" />
                  <span>Raise Zoho Invoice Batch</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </button>

              <button
                onClick={() => navigate('/payments')}
                className="w-full flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-slate-700 dark:text-slate-300 text-xs font-semibold transition cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-emerald-600" />
                  <span>Record Inward Payment</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </button>

              <button
                onClick={() => navigate('/govt-fees')}
                className="w-full flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-slate-700 dark:text-slate-300 text-xs font-semibold transition cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  <span>Reconcile Govt Fees</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default DashboardView;
