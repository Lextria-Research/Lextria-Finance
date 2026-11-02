// src/lib/supabase.ts
// Supabase client configured with the mandatory x-lextria-app: FINANCE header.
// Provides isolated schema accessors for 'finance' and 'core'.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.SUPABASE_URL ||
  'https://eafciegebhuhoneypsqy.supabase.co';

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhZmNpZWdlYmh1aG9uZXlwc3F5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwOTU1NTcsImV4cCI6MjEwNjY3MTU1N30.u1pqpPamztil2qaTaY7EahBaiWduVaQ3Wgu2_9CdJlg';

const serviceRoleKey =
  import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
  import.meta.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhZmNpZWdlYmh1aG9uZXlwc3F5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTA5NTU1NywiZXhwIjoyMTA2NjcxNTU3fQ.rxJJ-BO6bAeJYBu-tonvwxNZ3rh1D5ugjIpQMPk4qNo';

export const DATA_MODE =
  import.meta.env.VITE_DATA_MODE ||
  import.meta.env.DATA_MODE ||
  'supabase';

export const isSupabaseConfigured = true;

// Default client for user session & auth
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    autoRefreshToken: true,
  },
  global: {
    headers: {
      'x-lextria-app': 'FINANCE',
    },
  },
});

// Dedicated service-role client for finance, office, and core schemas
// Ensures queries are never blocked by missing PostgreSQL schema permissions on custom schemas
export const serviceSupabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  global: {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'x-lextria-app': 'FINANCE',
    },
  },
});

export const financeDb = serviceSupabase.schema('finance');
export const officeDb = serviceSupabase.schema('office');
export const coreDb = serviceSupabase.schema('core');
