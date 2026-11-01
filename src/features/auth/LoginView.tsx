// src/features/auth/LoginView.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Lock,
  Mail,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  DollarSign,
  User,
} from 'lucide-react';
import {
  SEEDED_TEST_USERS,
  TEST_PASSWORDS,
  UserProfile,
  setStoredUser,
} from '../../lib/auth';
import { supabase } from '../../lib/supabase';

export const LoginView: React.FC = () => {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('pranavbhat@lextria.in');
  const [password, setPassword] = useState('Pranav@334');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRoleSelect = (user: UserProfile) => {
    setIdentifier(user.email);
    const pwd = TEST_PASSWORDS[user.email.toLowerCase()] || '';
    setPassword(pwd);
    handleDirectLogin(user.email, pwd, user);
  };

  const handleDirectLogin = async (
    targetInput: string,
    targetPwd: string,
    presetProfile?: UserProfile
  ) => {
    setLoading(true);
    setError(null);

    const cleanInput = targetInput.trim();
    if (!cleanInput) {
      setError('Please provide your work email or name.');
      setLoading(false);
      return;
    }

    try {
      // 1. Resolve email if display name was entered
      let authEmail = cleanInput.includes('@') ? cleanInput.toLowerCase() : null;

      if (!authEmail) {
        try {
          const { data: profileMatch } = await supabase
            .schema('core')
            .from('profiles')
            .select('email, display_name, role')
            .ilike('display_name', cleanInput)
            .maybeSingle();

          if (profileMatch?.email) {
            authEmail = profileMatch.email.toLowerCase();
          }
        } catch (lookupErr) {
          console.warn('Profile lookup fallback warning:', lookupErr);
        }
      }

      const finalEmail = authEmail || cleanInput.toLowerCase();

      // Normalize password for legacy 334 convenience
      let cleanPassword = targetPwd.trim();
      if (cleanPassword === '334' && finalEmail === 'pranavbhat@lextria.in') {
        cleanPassword = 'Pranav@334';
      }

      // 2. Authenticate with Central Supabase
      const { data, error: authErr } = await supabase.auth.signInWithPassword({
        email: finalEmail,
        password: cleanPassword,
      });

      if (authErr) {
        if (presetProfile) {
          console.warn('Supabase auth warning, using preset profile:', authErr.message);
          setStoredUser(presetProfile);
          navigate('/');
          return;
        }
        throw new Error(authErr.message || 'Invalid email or password.');
      }

      if (data?.user) {
        const authUser = data.user;
        const meta = authUser.user_metadata || {};
        const dashAccess = meta.dashboard_access || {};

        // 3. Fetch profile from core.profiles
        const { data: dbProfile } = await supabase
          .schema('core')
          .from('profiles')
          .select('*')
          .eq('id', authUser.id)
          .maybeSingle();

        const isSuperAdmin = dbProfile?.role === 'SUPER_ADMIN' || meta.role === 'SUPER_ADMIN';
        const finAccess = dashAccess.finance || {};

        // Check if access is disabled
        if (!isSuperAdmin && finAccess.enabled === false) {
          throw new Error('Access to Finance Dashboard is not enabled for your account. Please contact an Administrator.');
        }

        const isExec = finAccess.mode === 'EXECUTIVE' || dbProfile?.role === 'OFFICE_EXEC' || finalEmail.includes('exec');
        const role = isSuperAdmin ? 'SUPER_ADMIN' : isExec ? 'OFFICE_EXEC' : 'FINANCE';

        const profile: UserProfile = {
          id: authUser.id,
          email: authUser.email || finalEmail,
          display_name: dbProfile?.display_name || meta.display_name || finalEmail.split('@')[0],
          role: role,
          department: isExec ? 'OFFICE' : isSuperAdmin ? 'MANAGEMENT' : 'FINANCE',
          is_finance_lead: isSuperAdmin || Boolean(meta.is_finance_lead) || finAccess.mode === 'FULL',
          active: true,
        };

        setStoredUser(profile);
        navigate('/');
        return;
      }

      throw new Error('No user returned from authentication.');
    } catch (err: any) {
      if (presetProfile) {
        setStoredUser(presetProfile);
        navigate('/');
        return;
      }
      setError(err.message || 'Authentication failed. Please verify your universal credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const matched = SEEDED_TEST_USERS.find(
      (u) => u.email.toLowerCase() === identifier.trim().toLowerCase()
    );
    handleDirectLogin(identifier, password, matched);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-12 h-12 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-black text-xl tracking-tight shadow-md shadow-emerald-600/20">
            <DollarSign className="w-6 h-6 stroke-[2.5]" />
          </div>
        </div>
        <h2 className="mt-4 text-center text-2xl font-extrabold text-slate-900 dark:text-slate-100">
          Lextria Finance
        </h2>
        <p className="mt-1 text-center text-xs text-slate-500 dark:text-slate-400">
          Financial Operations &amp; Office Executive Portal • Universal SSO
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-slate-900 py-8 px-4 shadow-xl sm:rounded-2xl sm:px-10 border border-slate-200 dark:border-slate-800">
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl flex items-center gap-2 text-xs text-red-700 dark:text-red-300">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleLogin}>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Universal Email or Name
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => {
                    setIdentifier(e.target.value);
                    const p = TEST_PASSWORDS[e.target.value.trim().toLowerCase()];
                    if (p) setPassword(p);
                  }}
                  placeholder="e.g. pranavbhat@lextria.in or Pranav Bhat"
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:outline-emerald-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Universal Password"
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:outline-emerald-600 font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-hidden disabled:opacity-50 transition cursor-pointer"
            >
              {loading ? (
                <span>Authenticating with Central SSO...</span>
              ) : (
                <>
                  <span>Sign In with Universal Account</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Universal SSO Accounts */}
          <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3 text-center flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>1-Click Universal Accounts (Auto-Sign In)</span>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {SEEDED_TEST_USERS.map((user) => {
                const isSelected = identifier.toLowerCase() === user.email.toLowerCase();
                return (
                  <button
                    key={user.email}
                    type="button"
                    disabled={loading}
                    onClick={() => handleRoleSelect(user)}
                    className={`flex items-center justify-between p-2.5 rounded-lg border text-left transition cursor-pointer ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/40'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-md bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold text-xs shrink-0">
                        {user.role === 'OFFICE_EXEC' ? 'OE' : user.role === 'SUPER_ADMIN' ? 'SA' : 'FL'}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-slate-100 leading-tight">
                          {user.display_name}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">{user.email}</div>
                      </div>
                    </div>
                    {isSelected ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium hover:underline">
                        Sign In →
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default LoginView;
