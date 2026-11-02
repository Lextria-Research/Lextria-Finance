// src/features/auth/LoginView.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Lock,
  Mail,
  AlertCircle,
  ArrowRight,
  DollarSign,
  Eye,
  EyeOff,
  Shield,
  Loader2,
} from 'lucide-react';
import { UserProfile, setStoredUser } from '../../lib/auth';
import { supabase } from '../../lib/supabase';

export const LoginView: React.FC = () => {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const cleanInput = identifier.trim();
    const cleanPassword = password.trim();

    if (!cleanInput) {
      setError('Please provide your work email or name.');
      setLoading(false);
      return;
    }

    if (!cleanPassword) {
      setError('Please enter your password.');
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
      let finalPassword = cleanPassword;
      if (finalPassword === '334' && finalEmail === 'pranavbhat@lextria.in') {
        finalPassword = 'Pranav@334';
      }

      // 2. Authenticate with Central Supabase SSO
      const { data, error: authErr } = await supabase.auth.signInWithPassword({
        email: finalEmail,
        password: finalPassword,
      });

      if (authErr) {
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
      setError(err.message || 'Authentication failed. Please verify your universal credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 selection:bg-emerald-600 selection:text-white">
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
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="e.g. pranavbhat@lextria.in or Pranav Bhat"
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:outline-emerald-600 transition"
                  autoFocus
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
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your security password"
                  className="w-full pl-9 pr-10 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:outline-emerald-600 transition font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-hidden disabled:opacity-50 transition cursor-pointer mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Authenticating with Central SSO...</span>
                </>
              ) : (
                <>
                  <span>Sign In with Universal Account</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 text-center">
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
              <Shield className="w-3.5 h-3.5 text-emerald-500" />
              <span>Universal Firm Single Sign-On Enabled</span>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-slate-500 mt-6">
          Lextria Legal &amp; Financial Operating System &bull; Central Single Sign-On
        </p>
      </div>
    </div>
  );
};
export default LoginView;
