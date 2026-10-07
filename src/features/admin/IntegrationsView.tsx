// src/features/admin/IntegrationsView.tsx
import React, { useState, useEffect } from 'react';
import {
  Database,
  Cloud,
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Send,
  Zap,
  RotateCcw,
} from 'lucide-react';
import { coreDb, financeDb, isSupabaseConfigured, supabase } from '../../lib/supabase';
import { getActiveProvider } from '../../lib/files';

export const IntegrationsView: React.FC = () => {
  const [testingSupabase, setTestingSupabase] = useState(false);
  const [supabaseStatus, setSupabaseStatus] = useState<string | null>(null);

  const [testingStorage, setTestingStorage] = useState(false);
  const [storageStatus, setStorageStatus] = useState<string | null>(null);

  const [testingCliq, setTestingCliq] = useState(false);
  const [cliqStatus, setCliqStatus] = useState<string | null>(null);

  const [outbox, setOutbox] = useState<any[]>([]);

  const storageProvider = getActiveProvider();

  const handleTestSupabase = async () => {
    setTestingSupabase(true);
    setSupabaseStatus(null);
    try {
      if (!isSupabaseConfigured) {
        throw new Error('Supabase anon key not set in environment.');
      }
      const [coreRes, finRes] = await Promise.all([
        coreDb.from('profiles').select('count', { count: 'exact', head: true }),
        financeDb.from('service_catalog').select('count', { count: 'exact', head: true }),
      ]);

      if (coreRes.error) {
        throw new Error(`Core schema error: ${coreRes.error.message}`);
      }
      if (finRes.error) {
        setSupabaseStatus(`Connected to Core schema (${coreRes.count ?? 0} profiles). Finance schema pending: ${finRes.error.message}`);
      } else {
        setSupabaseStatus(`Connected to Supabase! Core profiles: ${coreRes.count ?? 0}, Finance catalog: ${finRes.count ?? 0}`);
      }
    } catch (err: any) {
      setSupabaseStatus(`Error: ${err.message}`);
    } finally {
      setTestingSupabase(false);
    }
  };

  const handleTestStorage = async () => {
    setTestingStorage(true);
    setStorageStatus(null);
    try {
      if (storageProvider === 'WORKDRIVE') {
        setStorageStatus('WorkDrive environment detected.');
      } else if (storageProvider === 'SUPABASE_TEST') {
        const { data, error } = await supabase.storage.getBucket('test-files');
        if (error) {
          setStorageStatus(`Bucket test-files returned: ${error.message}`);
        } else {
          setStorageStatus(`Bucket test-files verified active (${data?.id}).`);
        }
      } else {
        setStorageStatus('Local mock file store active.');
      }
    } catch (err: any) {
      setStorageStatus(`Error: ${err.message}`);
    } finally {
      setTestingStorage(false);
    }
  };

  const loadOutbox = async () => {
    try {
      const { data } = await financeDb
        .from('cliq_outbox')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      if (data) setOutbox(data);
    } catch {
      // ignore
    }
  };

  const handleTestCliq = async () => {
    setTestingCliq(true);
    setCliqStatus(null);
    try {
      const resp = await fetch('/api/cliq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: '#finance-alerts',
          title: 'Manual Test from Finance Integrations View',
          link: '/admin/integrations',
        }),
      });
      const data = await resp.json();
      setCliqStatus(data.status === 'SENT' ? 'Delivered to Zoho Cliq channel.' : 'Queued in outbox fallback.');
      loadOutbox();
    } catch (err: any) {
      setCliqStatus(`Failed to post alert: ${err.message}`);
    } finally {
      setTestingCliq(false);
    }
  };

  const handleRetryOutbox = async (id: string) => {
    try {
      await financeDb.from('cliq_outbox').update({ status: 'SENT' }).eq('id', id);
      loadOutbox();
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadOutbox();
  }, []);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <span>Admin › Integrations &amp; Infrastructure</span>
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Verify database schemas, cloud document repositories, and Zoho Cliq notification pipelines.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Supabase Connection */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-2xs space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-emerald-600" />
                <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                  Supabase Database
                </h4>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-emerald-100 text-emerald-700">
                PostgreSQL
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Shared cluster accessing <code>schema core</code> and isolated <code>schema finance</code>.
            </p>
            {supabaseStatus && (
              <div className="text-[11px] font-mono p-2 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                {supabaseStatus}
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={testingSupabase}
            onClick={handleTestSupabase}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${testingSupabase ? 'animate-spin' : ''}`} />
            {testingSupabase ? 'Pinging...' : 'Test Connection'}
          </button>
        </div>

        {/* WorkDrive / Storage */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-2xs space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cloud className="w-5 h-5 text-blue-600" />
                <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                  Document Storage
                </h4>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-blue-100 text-blue-700">
                {storageProvider}
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Folder structure: <code>&#123;client_code&#125; - &#123;client_name&#125;/&#123;project_code&#125;/&#123;category&#125;/</code>.
              Fallback to Supabase bucket <code>test-files</code>.
            </p>
            {storageStatus && (
              <div className="text-[11px] font-mono p-2 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                {storageStatus}
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={testingStorage}
            onClick={handleTestStorage}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${testingStorage ? 'animate-spin' : ''}`} />
            {testingStorage ? 'Verifying...' : 'Verify Bucket'}
          </button>
        </div>

        {/* Zoho Cliq */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-2xs space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-purple-600" />
                <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                  Zoho Cliq Webhook
                </h4>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-purple-100 text-purple-700">
                Outbox Buffer
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Posts finance alerts, payment notices, and reimbursement reminders to <code>#finance-alerts</code>.
            </p>
            {cliqStatus && (
              <div className="text-[11px] font-mono p-2 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                {cliqStatus}
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={testingCliq}
            onClick={handleTestCliq}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 transition cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            {testingCliq ? 'Sending...' : 'Send Test Card'}
          </button>
        </div>
      </div>

      {/* Cliq Outbox Buffer Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-500" />
              Cliq Outbox Resiliency Queue (finance.cliq_outbox)
            </h3>
            <p className="text-[11px] text-slate-400">
              Messages queued or buffered when network is unavailable or webhook is pending
            </p>
          </div>
          <button
            type="button"
            onClick={loadOutbox}
            className="flex items-center gap-1 text-xs text-emerald-600 hover:underline cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            Refresh Queue
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border border-slate-200 dark:border-slate-800">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 uppercase font-semibold text-[10px] tracking-wider">
              <tr>
                <th className="py-2.5 px-3">Queued At</th>
                <th className="py-2.5 px-3">Channel</th>
                <th className="py-2.5 px-3">Alert Title</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {outbox.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                    {new Date(item.created_at).toLocaleString('en-IN')}
                  </td>
                  <td className="py-2.5 px-3 font-mono font-semibold text-slate-800 dark:text-slate-200">
                    {item.channel}
                  </td>
                  <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-slate-100">
                    {item.title}
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                        item.status === 'SENT'
                          ? 'bg-emerald-100 text-emerald-800'
                          : item.status === 'FAILED'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    {item.status !== 'SENT' && (
                      <button
                        type="button"
                        onClick={() => handleRetryOutbox(item.id)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Retry
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {outbox.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400 italic">
                    Outbox queue is empty. All alerts processed directly.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
export default IntegrationsView;
