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
  'mock-anon-key-for-local-dev';

export const DATA_MODE =
  import.meta.env.VITE_DATA_MODE ||
  import.meta.env.DATA_MODE ||
  'supabase';

export const isSupabaseConfigured = Boolean(
  supabaseAnonKey && supabaseAnonKey !== 'mock-anon-key-for-local-dev'
);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    headers: {
      'x-lextria-app': 'FINANCE',
    },
  },
});

export const financeDb = supabase.schema('finance');
export const coreDb = supabase.schema('core');
