// api/cron.ts
// Vercel Cron Endpoint for Daily Finance Sync and Reminders (18:00 IST / 12:30 UTC)
// 1. Advances event cursor and matches matter_events -> billing stages
// 2. Flags e-sign requests unsigned for > 5 days
// 3. Flags overdue statutory dates on misc jobs

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Supabase configuration missing in environment' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
    global: { headers: { 'x-lextria-app': 'FINANCE' } },
  });

  const now = new Date();
  const formatYMD = (d: Date) => d.toISOString().slice(0, 10);
  const todayStr = formatYMD(now);

  const results = {
    eventsSynced: 0,
    esignFlagged: 0,
    statutoryOverdue: 0,
  };

  try {
    // 1. Trigger automated stage sync
    const { data: syncData, error: syncErr } = await supabase
      .schema('finance')
      .rpc('sync_matter_events_to_billing_stages');

    if (!syncErr && syncData) {
      results.eventsSynced = typeof syncData === 'number' ? syncData : (syncData.completed_count || 0);
    }

    // 2. Unsigned e-sign requests > 5 days old
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const { data: staleEsigns } = await supabase
      .schema('finance')
      .from('esign_requests')
      .select('id, document_type, sent_at, client_id, quotation_id')
      .in('status', ['SENT', 'PARTIALLY_SIGNED'])
      .lte('sent_at', fiveDaysAgo);

    if (staleEsigns && staleEsigns.length > 0) {
      results.esignFlagged = staleEsigns.length;
    }

    // 3. Overdue statutory dates on misc jobs
    const { data: overdueMisc } = await supabase
      .schema('finance')
      .from('misc_jobs')
      .select('id, work_type, statutory_due_date, status')
      .neq('status', 'COMPLETED')
      .neq('status', 'CANCELLED')
      .lte('statutory_due_date', todayStr);

    if (overdueMisc && overdueMisc.length > 0) {
      results.statutoryOverdue = overdueMisc.length;
    }

    return res.status(200).json({ success: true, timestamp: now.toISOString(), results });
  } catch (err: any) {
    console.error('Finance cron error:', err);
    return res.status(500).json({ error: err.message });
  }
}
