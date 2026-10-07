const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = {};
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(l => {
  const m = l.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
});

const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;

const sbAdmin = createClient(url, serviceKey, { auth: { persistSession: false } });

async function check() {
  console.log('Testing finance schema access with admin client...');
  const catRes = await sbAdmin.schema('finance').from('service_catalog').select('*');
  if (catRes.error) {
    console.error('Error fetching service_catalog:', catRes.error.message);
  } else {
    console.log('Successfully queried finance.service_catalog! Count:', catRes.data.length);
  }

  const tmplRes = await sbAdmin.schema('finance').from('stage_templates').select('id, name');
  if (tmplRes.error) {
    console.error('Error fetching stage_templates:', tmplRes.error.message);
  } else {
    console.log('Successfully queried finance.stage_templates! Count:', tmplRes.data.length);
  }

  const cursorRes = await sbAdmin.schema('finance').from('event_cursor').select('*');
  if (cursorRes.error) {
    console.error('Error fetching event_cursor:', cursorRes.error.message);
  } else {
    console.log('Successfully queried finance.event_cursor! Count:', cursorRes.data.length);
  }
}

check();
