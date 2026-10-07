// src/features/clients/NewClientModal.tsx
import React, { useState, useEffect } from 'react';
import { X, AlertCircle, CheckCircle2, Building, ShieldCheck } from 'lucide-react';
import { coreDb, financeDb, isSupabaseConfigured } from '../../lib/supabase';

interface NewClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (ids: { client_id: string; project_code_id: string }) => void;
}

export const NewClientModal: React.FC<NewClientModalProps> = ({ isOpen, onClose, onCreated }) => {
  const [clientCode, setClientCode] = useState('');
  const [clientName, setClientName] = useState('');
  const [entityType, setEntityType] = useState('OTHER');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [stateCode, setStateCode] = useState('27'); // Default Maharashtra

  // Project code details
  const [projectCode, setProjectCode] = useState('');
  const [prefix, setPrefix] = useState('AR');
  const [department, setDepartment] = useState('IP_PATENT');
  const [title, setTitle] = useState('');

  // Live duplicate validation state
  const [clientCodeStatus, setClientCodeStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [projectCodeStatus, setProjectCodeStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check client code as user types
  useEffect(() => {
    const code = clientCode.trim();
    if (!code || code.length < 2) {
      setClientCodeStatus('idle');
      return;
    }
    const timer = setTimeout(async () => {
      setClientCodeStatus('checking');
      try {
        const { data } = await coreDb
          .from('clients')
          .select('id')
          .eq('client_code', code)
          .maybeSingle();
        setClientCodeStatus(data ? 'taken' : 'available');
      } catch {
        setClientCodeStatus('idle');
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [clientCode]);

  // Check project code as user types
  useEffect(() => {
    const raw = projectCode.trim();
    if (!raw || raw.length < 2) {
      setProjectCodeStatus('idle');
      return;
    }
    const normalized = raw.toUpperCase().replace(/\s/g, '');
    const timer = setTimeout(async () => {
      setProjectCodeStatus('checking');
      try {
        const { data } = await coreDb
          .from('project_codes')
          .select('id')
          .eq('code_normalized', normalized)
          .maybeSingle();
        setProjectCodeStatus(data ? 'taken' : 'available');
      } catch {
        setProjectCodeStatus('idle');
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [projectCode]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (clientCodeStatus === 'taken') {
      setError('Client code already exists — select it from the list');
      return;
    }
    if (projectCodeStatus === 'taken') {
      setError(`Project code "${projectCode}" already exists across the firm.`);
      return;
    }
    if (!clientCode.trim() || !clientName.trim() || !projectCode.trim() || !title.trim()) {
      setError('Please fill in all mandatory fields (Client Code, Name, Project Code, and Matter Title).');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (isSupabaseConfigured) {
        const { data, error: rpcErr } = await financeDb.rpc('create_client_and_project_code', {
          p_client_code: clientCode.trim(),
          p_client_name: clientName.trim(),
          p_entity_type: entityType,
          p_email: email.trim() || null,
          p_phone: phone.trim() || null,
          p_gstin: gstin.trim() || null,
          p_pan: pan.trim() || null,
          p_billing_address: billingAddress.trim() || null,
          p_state_code: stateCode.trim() || null,
          p_code: projectCode.trim(),
          p_prefix: prefix.trim() || null,
          p_department: department,
          p_title: title.trim(),
        });

        if (rpcErr) {
          throw new Error(rpcErr.message);
        }

        onCreated(data);
        onClose();
      } else {
        onCreated({ client_id: 'mock-client', project_code_id: 'mock-project' });
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create client and matter.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building className="w-5 h-5 text-emerald-600" />
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Create Client &amp; Matter Code
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 text-xs">
          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl flex items-center gap-2 text-rose-700 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Client Details Section */}
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">
              1. Master Client Details
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Client Code *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={clientCode}
                    onChange={(e) => setClientCode(e.target.value.toUpperCase())}
                    placeholder="e.g. CLI-1090"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 font-mono focus:outline-emerald-600"
                  />
                  {clientCodeStatus === 'checking' && (
                    <span className="absolute right-3 top-2.5 text-[10px] text-slate-400">Checking...</span>
                  )}
                  {clientCodeStatus === 'available' && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 absolute right-3 top-2.5" />
                  )}
                  {clientCodeStatus === 'taken' && (
                    <AlertCircle className="w-4 h-4 text-rose-600 absolute right-3 top-2.5" />
                  )}
                </div>
                {clientCodeStatus === 'taken' && (
                  <p className="text-[10px] text-rose-600 mt-1">
                    Client code already exists — select it from the list.
                  </p>
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Client / Entity Name *
                </label>
                <input
                  type="text"
                  required
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="e.g. Bharat Biotech Innovations Ltd"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-emerald-600"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Entity Category
                </label>
                <select
                  value={entityType}
                  onChange={(e) => setEntityType(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-emerald-600"
                >
                  <option value="OTHER">Other / Corporate</option>
                  <option value="NATURAL_PERSON">Natural Person</option>
                  <option value="STARTUP">Recognized Startup</option>
                  <option value="SMALL_ENTITY">Small Entity (MSME)</option>
                  <option value="EDUCATIONAL_INSTITUTION">Educational Institution</option>
                  <option value="LARGE_ENTITY">Large Entity</option>
                  <option value="GOVERNMENT">Government Organization</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  GST State Code (2-digit)
                </label>
                <input
                  type="text"
                  value={stateCode}
                  maxLength={2}
                  onChange={(e) => setStateCode(e.target.value)}
                  placeholder="27 (Maharashtra), 07 (Delhi)..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 font-mono focus:outline-emerald-600"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  GSTIN
                </label>
                <input
                  type="text"
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value.toUpperCase())}
                  placeholder="27AAACB1234F1Z5"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 font-mono focus:outline-emerald-600"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  PAN
                </label>
                <input
                  type="text"
                  value={pan}
                  maxLength={10}
                  onChange={(e) => setPan(e.target.value.toUpperCase())}
                  placeholder="AAACB1234F"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 font-mono focus:outline-emerald-600"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="billing@bharatbiotech.example"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-emerald-600"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-emerald-600"
                />
              </div>
            </div>

            <div className="mt-3">
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Billing Address
              </label>
              <textarea
                rows={2}
                value={billingAddress}
                onChange={(e) => setBillingAddress(e.target.value)}
                placeholder="Complete street address for invoicing..."
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-emerald-600"
              />
            </div>
          </div>

          {/* Project Code / Matter Details Section */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">
              2. Initial Matter / Project Code Details
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Project Code *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={projectCode}
                    onChange={(e) => setProjectCode(e.target.value)}
                    placeholder="e.g. AR1090"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 font-mono focus:outline-emerald-600"
                  />
                  {projectCodeStatus === 'checking' && (
                    <span className="absolute right-3 top-2.5 text-[10px] text-slate-400">Checking...</span>
                  )}
                  {projectCodeStatus === 'available' && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 absolute right-3 top-2.5" />
                  )}
                  {projectCodeStatus === 'taken' && (
                    <AlertCircle className="w-4 h-4 text-rose-600 absolute right-3 top-2.5" />
                  )}
                </div>
                {projectCodeStatus === 'taken' && (
                  <p className="text-[10px] text-rose-600 mt-1">
                    Normalized code already exists across the firm.
                  </p>
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Prefix
                </label>
                <input
                  type="text"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                  placeholder="AR, LIT, AGR..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 font-mono focus:outline-emerald-600"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Department
                </label>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-emerald-600"
                >
                  <option value="IP_PATENT">IP Patent</option>
                  <option value="IP_SOFT">IP Soft (TM/CR/Design)</option>
                  <option value="LITIGATION">Litigation</option>
                  <option value="AGREEMENT">Agreements</option>
                  <option value="MISC_VENDOR">Misc Vendor Work</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
            </div>

            <div className="mt-3">
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Matter Title *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Patent Filing for Novel Protein Extraction System"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-emerald-600"
              />
            </div>
          </div>

          {/* Footer buttons */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || clientCodeStatus === 'taken' || projectCodeStatus === 'taken'}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5"
            >
              {saving ? 'Creating Client & Matter...' : 'Create Client & Matter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
export default NewClientModal;
