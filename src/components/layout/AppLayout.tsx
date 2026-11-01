// src/components/layout/AppLayout.tsx
import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  FileSpreadsheet,
  CheckSquare,
  Receipt,
  CreditCard,
  BookOpen,
  DollarSign,
  Landmark,
  BadgePercent,
  Briefcase,
  Coins,
  Settings,
  Cpu,
  Search,
  Bell,
  LogOut,
  RefreshCw,
  Menu,
  X,
  Truck,
  Contact,
} from 'lucide-react';
import {
  getStoredUser,
  setStoredUser,
  signOutUser,
  UserProfile,
  isFinance,
  isParalegal,
  isOfficeExec,
} from '../../lib/auth';
import { coreDb, financeDb, isSupabaseConfigured, supabase } from '../../lib/supabase';
import { RoleBanner } from '../common/RoleBanner';
import { GlobalSearchModal } from '../common/GlobalSearchModal';

export const AppLayout: React.FC = () => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(getStoredUser());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifMenuOpen, setNotifMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
    }
  }, [currentUser, navigate]);

  // Load notifications
  useEffect(() => {
    if (!currentUser || !isSupabaseConfigured) return;
    const fetchNotifs = async () => {
      try {
        const { data } = await coreDb
          .from('notifications')
          .select('*')
          .eq('user_id', currentUser.id)
          .order('created_at', { ascending: false })
          .limit(6);
        if (data) setNotifications(data);
      } catch {
        // ignore
      }
    };
    fetchNotifs();
  }, [currentUser]);

  // Sync now action
  const handleSyncNow = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      if (isSupabaseConfigured) {
        const { data, error } = await financeDb.rpc('sync_matter_events_to_billing_stages');
        if (error) {
          setSyncResult(`Sync error: ${error.message}`);
        } else {
          const count = typeof data === 'number' ? data : (data?.completed_count ?? 0);
          setSyncResult(`Synced! ${count} billing stage(s) completed.`);
        }
      } else {
        setSyncResult('Mock sync complete (0 events)');
      }
    } catch (e: any) {
      setSyncResult(`Sync exception: ${e.message}`);
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncResult(null), 4000);
    }
  };

  const handleSignOut = () => {
    signOutUser();
    supabase.auth.signOut().catch(() => {});
    navigate('/login');
  };

  const handleSwitchUser = (user: UserProfile) => {
    setStoredUser(user);
    setCurrentUser(user);
    setUserMenuOpen(false);
    window.location.reload();
  };

  // Determine authorized nav items based on role
  const isFinUser = isFinance(currentUser);
  const isParaUser = isParalegal(currentUser);
  const isExecUser = isOfficeExec(currentUser);

  useEffect(() => {
    if (isExecUser && window.location.pathname === '/') {
      navigate('/dispatches', { replace: true });
    }
  }, [isExecUser, navigate]);

  const allNavItems = [
    {
      label: 'Dashboard',
      path: '/',
      icon: LayoutDashboard,
      visible: isFinUser,
    },
    {
      label: 'Post & Courier',
      path: '/dispatches',
      icon: Truck,
      visible: isFinUser || isExecUser,
    },
    {
      label: 'Address Book',
      path: '/address-book',
      icon: Contact,
      visible: isFinUser || isExecUser,
    },
    {
      label: 'Petty Cash',
      path: '/petty-cash',
      icon: Coins,
      visible: isFinUser || isExecUser,
    },
    {
      label: 'Clients & Matters',
      path: '/clients',
      icon: Users,
      visible: isFinUser,
    },
    {
      label: 'Quotations',
      path: '/quotations',
      icon: FileSpreadsheet,
      visible: isFinUser,
    },
    {
      label: 'Ready to Invoice',
      path: '/ready-to-invoice',
      icon: CheckSquare,
      visible: isFinUser,
    },
    {
      label: 'Invoices (Zoho)',
      path: '/invoices',
      icon: Receipt,
      visible: isFinUser,
    },
    {
      label: 'Payments & Advances',
      path: '/payments',
      icon: CreditCard,
      visible: isFinUser,
    },
    {
      label: 'Client Ledger',
      path: '/ledger',
      icon: BookOpen,
      visible: isFinUser,
    },
    {
      label: 'Recoverable Costs',
      path: '/recoverable-costs',
      icon: DollarSign,
      visible: isFinUser,
    },
    {
      label: 'Govt Fees',
      path: '/govt-fees',
      icon: Landmark,
      visible: !isExecUser, // Visible to all staff (Paralegal, Associate, Finance)
    },
    {
      label: 'Reimbursements',
      path: '/reimbursements',
      icon: BadgePercent,
      visible: !isParaUser && !isExecUser, // All staff, managers, and finance
    },
    {
      label: 'Miscellaneous Jobs',
      path: '/misc-jobs',
      icon: Briefcase,
      visible: isFinUser,
    },
    {
      label: 'Settings',
      path: '/settings',
      icon: Settings,
      visible: isFinUser,
    },
    {
      label: 'Integrations',
      path: '/admin/integrations',
      icon: Cpu,
      visible: isFinUser,
    },
  ];

  const visibleNav = allNavItems.filter((i) => i.visible);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Super Admin Simulation Banner */}
      <RoleBanner
        currentUser={currentUser}
        onRoleChange={() => setCurrentUser(getStoredUser())}
      />

      {/* Top Header */}
      <header className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="lg:hidden p-1.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div
            onClick={() => navigate('/')}
            className="flex items-center gap-2 cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-black text-sm shadow-xs shadow-emerald-600/30">
              LX
            </div>
            <div>
              <span className="font-extrabold text-sm tracking-tight text-slate-900 dark:text-slate-100">
                Lextria Finance
              </span>
              <span className="hidden sm:inline-block ml-2 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                Operations
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Sync Now Button */}
          {isFinUser && (
            <button
              type="button"
              onClick={handleSyncNow}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 dark:text-emerald-300 transition cursor-pointer"
              title="Read new core.matter_events and auto-complete matching billing stages"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{syncing ? 'Syncing...' : 'Sync now'}</span>
            </button>
          )}

          {/* Sync result toast */}
          {syncResult && (
            <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-2 py-1 rounded border border-emerald-200 dark:border-emerald-800 animate-fade-in">
              {syncResult}
            </div>
          )}

          {/* Search Trigger */}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            title="Global search (Ctrl+K)"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* Notifications */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setNotifMenuOpen(!notifMenuOpen)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition relative cursor-pointer"
            >
              <Bell className="w-4 h-4" />
              {notifications.length > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500" />
              )}
            </button>

            {notifMenuOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-3 z-50 text-xs">
                <div className="font-bold text-slate-900 dark:text-slate-100 pb-2 border-b border-slate-100 dark:border-slate-800 mb-2 flex items-center justify-between">
                  <span>Notifications</span>
                  <span className="text-[10px] text-slate-400 font-normal font-mono">
                    {notifications.length} recent
                  </span>
                </div>
                {notifications.length === 0 ? (
                  <div className="text-slate-400 py-3 text-center italic">No new notifications</div>
                ) : (
                  <div className="space-y-1.5 max-h-60 overflow-y-auto">
                    {notifications.map((n) => (
                      <div
                        key={n.id}
                        className="p-2 bg-slate-50 dark:bg-slate-800/60 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-lg cursor-pointer transition"
                      >
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{n.title}</div>
                        {n.body && <div className="text-slate-500 text-[11px] line-clamp-2 mt-0.5">{n.body}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* User Profile / Quick Switcher */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold text-xs">
                {currentUser?.display_name?.charAt(0) || 'U'}
              </div>
              <div className="hidden sm:block text-left">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-tight">
                  {currentUser?.display_name?.split(' ')[0]}
                </div>
                <div className="text-[10px] text-slate-400 leading-none capitalize">
                  {currentUser?.role?.toLowerCase().replace(/_/g, ' ')}
                </div>
              </div>
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-3 z-50 text-xs">
                <div className="pb-2 border-b border-slate-100 dark:border-slate-800 mb-2">
                  <div className="font-bold text-slate-900 dark:text-slate-100">{currentUser?.display_name}</div>
                  <div className="text-slate-400 text-[11px]">{currentUser?.email}</div>
                  <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium uppercase mt-0.5">
                    {currentUser?.department} • {currentUser?.role}
                  </div>
                </div>

                <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 p-1.5 rounded-md font-medium text-xs transition cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Grid: Sidebar + View Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Desktop Sidebar */}
        <aside className="w-60 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between hidden lg:flex shrink-0">
          <div className="p-3 space-y-1 overflow-y-auto">
            <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Finance &amp; Accounts
            </div>
            {visibleNav.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-xs shadow-emerald-600/30'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-slate-100'
                  }`
                }
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>

          <div className="p-3 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-400 space-y-1">
            <div className="flex items-center justify-between font-mono text-[10px]">
              <span>Schema: finance</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">RLS ACTIVE</span>
            </div>
            <div>Lextria Research © 2026</div>
          </div>
        </aside>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <div
              className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="relative w-64 bg-white dark:bg-slate-900 p-4 flex flex-col justify-between h-full z-10 shadow-2xl">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 mb-3">
                  <div className="font-bold text-sm text-slate-900 dark:text-slate-100">Menu</div>
                  <button onClick={() => setMobileMenuOpen(false)}>
                    <X className="w-5 h-5 text-slate-500" />
                  </button>
                </div>
                <div className="space-y-1">
                  {visibleNav.map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={item.path === '/'}
                      onClick={() => setMobileMenuOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition ${
                          isActive
                            ? 'bg-emerald-600 text-white'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`
                      }
                    >
                      <item.icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>

      {/* Global Search Modal */}
      <GlobalSearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
};
export default AppLayout;
