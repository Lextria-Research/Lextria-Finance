// src/lib/auth.ts
// Handles authentication in dual modes: 'test' (preset role accounts) and 'otp' (6-digit email OTP).
// Also manages SUPER_ADMIN "View As Role" simulation and role authorization helpers.

export type Role =
  | 'SUPER_ADMIN'
  | 'DEPT_ADMIN'
  | 'FINANCE'
  | 'PARALEGAL'
  | 'DRAFTER'
  | 'ASSOCIATE'
  | 'INTERN'
  | 'OFFICE_EXEC'
  | 'STAFF';

export type Department =
  | 'MANAGEMENT'
  | 'IP_PATENT'
  | 'IP_SOFT'
  | 'PARALEGAL'
  | 'LITIGATION'
  | 'AGREEMENT'
  | 'FINANCE'
  | 'OFFICE';

export interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  department: Department;
  reports_to?: string | null;
  is_finance_lead: boolean;
  active: boolean;
}

export const AUTH_MODE: 'test' | 'otp' =
  (import.meta.env.VITE_AUTH_MODE as 'test' | 'otp') || 'test';

export const SEEDED_TEST_USERS: UserProfile[] = [
  {
    id: 'fl-uuid-finance-lead',
    email: 'fl@lextria-demo.test',
    display_name: 'Ramesh Patel (Finance Lead)',
    role: 'FINANCE',
    department: 'FINANCE',
    is_finance_lead: true,
    active: true,
  },
  {
    id: 'sa1-uuid-super-admin',
    email: 'sa1@lextria-demo.test',
    display_name: 'Ananya Sharma (Partner / Super Admin)',
    role: 'SUPER_ADMIN',
    department: 'MANAGEMENT',
    is_finance_lead: false,
    active: true,
  },
  {
    id: 'lithead-uuid-dept-admin',
    email: 'lithead@lextria-demo.test',
    display_name: 'Sanjay Deshmukh (Litigation Head / Manager)',
    role: 'DEPT_ADMIN',
    department: 'LITIGATION',
    is_finance_lead: false,
    active: true,
  },
  {
    id: 'pa1-uuid-paralegal',
    email: 'pa1@lextria-demo.test',
    display_name: 'Priya Sharma (Paralegal)',
    role: 'PARALEGAL',
    department: 'PARALEGAL',
    is_finance_lead: false,
    active: true,
  },
  {
    id: 'staff-uuid-member',
    email: 'staff@lextria-demo.test',
    display_name: 'Vikram Malhotra (Staff - Reports to Sanjay)',
    role: 'STAFF',
    department: 'LITIGATION',
    is_finance_lead: false,
    active: true,
  },
  {
    id: 'oe-uuid-office-exec',
    email: 'exec@lextria-demo.test',
    display_name: 'Manoj Kumar (Office Executive)',
    role: 'OFFICE_EXEC',
    department: 'OFFICE',
    is_finance_lead: false,
    active: true,
  },
];

export const TEST_PASSWORDS: Record<string, string> = {
  'fl@lextria-demo.test': 'Lx!+r9Lw#cJrM2#Jtqj',
  'sa1@lextria-demo.test': 'Lx!2A22dDQrY7KWjamc',
  'lithead@lextria-demo.test': 'Lx!+KFU7*m#ggKKpf!9',
  'pa1@lextria-demo.test': 'Lx!P@r4l3g4l!99',
  'staff@lextria-demo.test': 'Lx!St4ffM3mb3r!88',
  'exec@lextria-demo.test': 'Lx!Off1c3Exec!2026',
};

const LOCAL_STORAGE_USER_KEY = 'lextria_finance_active_profile';
const LOCAL_STORAGE_VIEW_AS_KEY = 'lextria_finance_view_as_role';

export function getStoredUser(): UserProfile | null {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_USER_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  return null;
}

export function setStoredUser(user: UserProfile | null) {
  if (user) {
    localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(LOCAL_STORAGE_USER_KEY);
    localStorage.removeItem(LOCAL_STORAGE_VIEW_AS_KEY);
  }
}

export function signOutUser() {
  setStoredUser(null);
}

export function getViewAsRole(): Role | null {
  return (localStorage.getItem(LOCAL_STORAGE_VIEW_AS_KEY) as Role) || null;
}

export function setViewAsRole(role: Role | null) {
  if (role) {
    localStorage.setItem(LOCAL_STORAGE_VIEW_AS_KEY, role);
  } else {
    localStorage.removeItem(LOCAL_STORAGE_VIEW_AS_KEY);
  }
}

/**
 * Returns effective role accounting for SUPER_ADMIN "View As Role" simulation
 */
export function getEffectiveRole(user: UserProfile | null): Role {
  if (!user) return 'STAFF';
  if (user.role === 'SUPER_ADMIN') {
    const viewAs = getViewAsRole();
    if (viewAs) return viewAs;
  }
  return user.role;
}

export function hasRole(user: UserProfile | null, allowedRoles: Role[]): boolean {
  const role = getEffectiveRole(user);
  return allowedRoles.includes(role);
}

export function isFinanceLead(user: UserProfile | null): boolean {
  if (!user) return false;
  return user.role === 'SUPER_ADMIN' || (user.role === 'FINANCE' && user.is_finance_lead);
}

export function isFinance(user: UserProfile | null): boolean {
  return hasRole(user, ['FINANCE', 'SUPER_ADMIN']);
}

export function isParalegal(user: UserProfile | null): boolean {
  return getEffectiveRole(user) === 'PARALEGAL';
}

export function isOfficeExec(user: UserProfile | null): boolean {
  return getEffectiveRole(user) === 'OFFICE_EXEC';
}

export function isSuperAdmin(user: UserProfile | null): boolean {
  return user?.role === 'SUPER_ADMIN';
}

import { useState, useEffect } from 'react';

export function useAuth() {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(getStoredUser());

  useEffect(() => {
    const handleStorage = () => {
      setUserProfile(getStoredUser());
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return {
    user: userProfile ? { id: userProfile.id, email: userProfile.email } : null,
    profile: userProfile,
    role: getEffectiveRole(userProfile),
    signOut: () => {
      signOutUser();
      setUserProfile(null);
    }
  };
}
