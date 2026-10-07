const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = {};
const lines = fs.readFileSync('.env.local', 'utf8').split('\n');
for (const line of lines) {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let val = match[2] || '';
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[match[1]] = val;
  }
}

const supabaseUrl = env['VITE_SUPABASE_URL'] || env['SUPABASE_URL'];
const serviceRoleKey = env['SUPABASE_SERVICE_ROLE_KEY'];

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

async function run() {
  const { data, error } = await supabase
    .schema('core')
    .from('profiles')
    .select('id, email, display_name, role, department, reports_to, is_finance_lead, active');

  if (error) {
    console.error('Query error:', error.message);
  } else {
    console.log('Profiles found:', data.length);
    for (const p of data) {
      console.log(`- ${p.email} | ${p.role} | ${p.department} | ${p.display_name} | reports_to: ${p.reports_to} | lead: ${p.is_finance_lead}`);
    }
  }
}

run();
