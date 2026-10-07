// src/features/settings/SettingsView.tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Settings, Sliders, Shield, Tag, Layers, Landmark, 
  PlusCircle, CheckCircle2, Save, X, RefreshCw
} from 'lucide-react';
import { financeDb, coreDb } from '../../lib/supabase';
import { formatINR } from '../../lib/currency';
import { getStoredUser } from '../../lib/auth';
import type { 
  ServiceCatalogItem, StageTemplate, ClientRateCard, 
  PostingRule, FeeScheduleItem 
} from '../../lib/types';

export default function SettingsView() {
  const [activeTab, setActiveTab] = useState<'SERVICES' | 'TEMPLATES' | 'RATE_CARDS' | 'RULES' | 'FEES' | 'PARAMS'>('SERVICES');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
          <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
            <Settings className="w-6 h-6" />
          </div>
          Finance Administration & Master Settings
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Configure service tariffs, milestone completion triggers, pure agent posting rules, and firm tax parameters
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 overflow-x-auto">
        {(['SERVICES', 'TEMPLATES', 'RATE_CARDS', 'RULES', 'FEES', 'PARAMS'] as const).map(tab => {
          const labels: Record<string, string> = {
            SERVICES: 'Service Catalog',
            TEMPLATES: 'Milestone Templates',
            RATE_CARDS: 'Client Rate Cards',
            RULES: 'Disbursement Posting Rules',
            FEES: 'Statutory Fee Schedule',
            PARAMS: 'Tax & Firm Parameters'
          };

          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-3 text-sm font-semibold border-b-2 transition whitespace-nowrap ${
                activeTab === tab
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {labels[tab]}
            </button>
          );
        })}
      </div>

      {activeTab === 'SERVICES' && <ServicesTab />}
      {activeTab === 'TEMPLATES' && <StageTemplatesTab />}
      {activeTab === 'RATE_CARDS' && <RateCardsTab />}
      {activeTab === 'RULES' && <PostingRulesTab />}
      {activeTab === 'FEES' && <FeeScheduleTab />}
      {activeTab === 'PARAMS' && <FirmParamsTab />}
    </div>
  );
}

// 1. Service Catalog Tab
function ServicesTab() {
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [defaultFee, setDefaultFee] = useState<number>(0);

  const { data: services = [], isLoading, refetch } = useQuery({
    queryKey: ['service-catalog-settings'],
    queryFn: async () => {
      const { data, error } = await financeDb
        .from('service_catalog')
        .select('*')
        .order('name');
      if (error) throw error;
      return (data || []) as ServiceCatalogItem[];
    }
  });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      const user = getStoredUser();
      const { error } = await financeDb.from('service_catalog').insert({
        name: name.trim(),
        default_fee: defaultFee,
        active: true,
        created_by: user?.id
      });
      if (error) throw error;
      setShowAdd(false);
      setName('');
      setDefaultFee(0);
      refetch();
    } catch (err: any) {
      alert(err.message || 'Failed to add service');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-xs text-slate-500">Standard professional fees for services rendered</p>
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl"
        >
          <PlusCircle className="w-3.5 h-3.5" /> Add Service
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase">
            <tr>
              <th className="px-5 py-3.5">Service Name</th>
              <th className="px-5 py-3.5 text-right">Standard Fee (₹)</th>
              <th className="px-5 py-3.5 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {services.map(s => (
              <tr key={s.id} className="hover:bg-slate-50/60">
                <td className="px-5 py-3.5 font-medium text-slate-900">{s.name}</td>
                <td className="px-5 py-3.5 text-right font-mono font-semibold text-slate-800">{formatINR(s.default_fee)}</td>
                <td className="px-5 py-3.5 text-center">
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
                    Active
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full">
            <h3 className="text-base font-bold text-slate-900 mb-4">Add Standard Service</h3>
            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Service Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Default Fee (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={defaultFee || ''}
                  onChange={(e) => setDefaultFee(Number(e.target.value))}
                  required
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button type="button" onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-xs text-slate-600">Cancel</button>
                <button type="submit" className="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-xl">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// 2. Stage Templates Tab
function StageTemplatesTab() {
  const { data: templates = [] } = useQuery({
    queryKey: ['stage-templates-settings'],
    queryFn: async () => {
      const { data, error } = await financeDb
        .from('stage_templates')
        .select('*')
        .order('name');
      if (error) throw error;
      return (data || []) as StageTemplate[];
    }
  });

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Pre-configured milestone completion packages with automatic trigger event codes
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {templates.map(t => (
          <div key={t.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="text-sm font-bold text-slate-900">{t.name}</h4>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
                {t.items?.length || 0} Stages
              </span>
            </div>

            <div className="border border-slate-100 rounded-xl divide-y divide-slate-100 text-xs">
              {t.items?.map((it, idx) => (
                <div key={idx} className="p-2.5 flex justify-between items-center bg-slate-50/40">
                  <div>
                    <span className="font-semibold text-slate-800">{it.name}</span>
                    <span className="text-slate-400 block font-mono text-[10px]">
                      {it.trigger_event_code ? `Trigger: ${it.trigger_event_code}` : 'Manual Completion'}
                    </span>
                  </div>
                  <span className="font-mono font-bold text-emerald-700">{it.percent}%</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 3. Client Rate Cards Tab
function RateCardsTab() {
  const { data: rateCards = [] } = useQuery({
    queryKey: ['rate-cards-settings'],
    queryFn: async () => {
      const { data, error } = await financeDb
        .from('client_rate_cards')
        .select(`
          *,
          client:client_id(client_code, client_name),
          service:service_id(name)
        `)
        .order('valid_from', { ascending: false });
      if (error) throw error;
      return (data || []).map((rc: any) => ({
        ...rc,
        client_code: rc.client?.client_code,
        client_name: rc.client?.client_name,
        service_name: rc.service?.name
      })) as any[];
    }
  });

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">Negotiated discounted or custom fee structures per client</p>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase">
            <tr>
              <th className="px-5 py-3.5">Client</th>
              <th className="px-5 py-3.5">Service</th>
              <th className="px-5 py-3.5 text-right">Negotiated Fee (₹)</th>
              <th className="px-5 py-3.5">Effective Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {rateCards.length === 0 ? (
              <tr><td colSpan={4} className="p-8 text-center text-xs text-slate-400">No client rate cards defined. Standard catalog applies.</td></tr>
            ) : (
              rateCards.map(rc => (
                <tr key={rc.id} className="hover:bg-slate-50/60">
                  <td className="px-5 py-3.5 font-semibold text-slate-900">{rc.client_name} ({rc.client_code})</td>
                  <td className="px-5 py-3.5 text-slate-800">{rc.service_name}</td>
                  <td className="px-5 py-3.5 text-right font-mono font-bold text-emerald-700">{formatINR(rc.fee)}</td>
                  <td className="px-5 py-3.5 text-xs text-slate-500">{rc.valid_from}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 4. Posting Rules Tab
function PostingRulesTab() {
  const { data: rules = [] } = useQuery({
    queryKey: ['posting-rules-settings'],
    queryFn: async () => {
      const { data, error } = await financeDb
        .from('posting_rules')
        .select('*')
        .order('category');
      if (error) throw error;
      return (data || []) as PostingRule[];
    }
  });

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Disbursement ledger rules determining whether costs auto-post to unbilled ledger or await finance review
      </p>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase">
            <tr>
              <th className="px-5 py-3.5">Cost Category</th>
              <th className="px-5 py-3.5 text-center">Recoverable from Client?</th>
              <th className="px-5 py-3.5 text-center">Auto-Post to Ledger?</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {rules.map(r => (
              <tr key={r.id} className="hover:bg-slate-50/60">
                <td className="px-5 py-3.5 font-semibold text-slate-900">{r.category}</td>
                <td className="px-5 py-3.5 text-center">
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${r.recoverable ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
                    {r.recoverable ? 'Yes (Pure Agent)' : 'No (Internal Overhead)'}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-center">
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${r.auto_post ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'}`}>
                    {r.auto_post ? 'Auto-Post' : 'Requires Review'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 5. Statutory Fee Schedule Tab
function FeeScheduleTab() {
  const { data: fees = [] } = useQuery({
    queryKey: ['fee-schedule-settings'],
    queryFn: async () => {
      const { data, error } = await financeDb
        .from('fee_schedule')
        .select('*')
        .order('office');
      if (error) throw error;
      return (data || []) as FeeScheduleItem[];
    }
  });

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">Official registry e-filing statutory tariffs for Patents, Trademarks, and High Court</p>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase">
            <tr>
              <th className="px-5 py-3.5">Office / Registry</th>
              <th className="px-5 py-3.5">Form / Action</th>
              <th className="px-5 py-3.5">Applicant Category</th>
              <th className="px-5 py-3.5 text-right">E-Filing Fee (₹)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {fees.length === 0 ? (
              <tr><td colSpan={4} className="p-8 text-center text-xs text-slate-400">Statutory fees loaded from registry schedules</td></tr>
            ) : (
              fees.map(f => (
                <tr key={f.id} className="hover:bg-slate-50/60">
                  <td className="px-5 py-3.5 font-semibold text-slate-900">{f.office}</td>
                  <td className="px-5 py-3.5 text-slate-800 font-medium">{f.form_or_action}</td>
                  <td className="px-5 py-3.5 text-xs text-slate-600">{f.applicant_fee_category}</td>
                  <td className="px-5 py-3.5 text-right font-mono font-bold text-slate-900">{formatINR(f.efiling_amount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 6. Firm Tax & App Parameters Tab
function FirmParamsTab() {
  const { data: settings = [] } = useQuery({
    queryKey: ['app-settings-finance'],
    queryFn: async () => {
      const { data, error } = await coreDb
        .from('app_settings')
        .select('*')
        .eq('app', 'FINANCE');
      if (error) throw error;
      return (data || []) as any[];
    }
  });

  return (
    <div className="space-y-4 max-w-xl">
      <p className="text-xs text-slate-500">Firm-wide tax calculation, state code jurisdiction, and payout cycles</p>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
        {settings.map(s => (
          <div key={s.id || s.key} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-none">
            <div>
              <span className="font-semibold text-xs text-slate-800 block capitalize">{s.key.replace(/_/g, ' ')}</span>
              <span className="text-[11px] text-slate-400 font-mono">key: {s.key}</span>
            </div>
            <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200 text-xs">
              {typeof s.value === 'object' ? JSON.stringify(s.value) : String(s.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
