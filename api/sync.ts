// api/sync.ts
// Secure endpoint for on-demand synchronization of matter_events to billing stages
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  'https://eafciegebhuhoneypsqy.supabase.co';

const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhZmNpZWdlYmh1aG9uZXlwc3F5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTA5NTU1NywiZXhwIjoyMTA2NjcxNTU3fQ.rxJJ-BO6bAeJYBu-tonvwxNZ3rh1D5ugjIpQMPk4qNo';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-lextria-app');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Allow GET and POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
      global: { headers: { 'x-lextria-app': 'FINANCE' } },
    });

    const { data: syncData, error: syncErr } = await supabase
      .schema('finance')
      .rpc('sync_matter_events_to_billing_stages');

    if (syncErr) {
      console.error('Server sync RPC error:', syncErr);
      return res.status(500).json({ error: syncErr.message });
    }

    const completedCount =
      typeof syncData === 'number'
        ? syncData
        : (syncData?.completed_count ?? 0);

    return res.status(200).json({
      success: true,
      completed_count: completedCount,
      data: syncData,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Sync endpoint exception:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}

