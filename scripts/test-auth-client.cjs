const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = {};
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(l => {
  const m = l.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
});

const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;

const sb = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { headers: { 'x-lextria-app': 'FINANCE' } }
});

const testPasswords = {};
if (fs.existsSync('test-logins.txt')) {
  fs.readFileSync('test-logins.txt', 'utf8').split('\n').forEach(line => {
    const emailMatch = line.match(/Email:\s*([^\s|]+)/);
    const passMatch = line.match(/Password:\s*([^\s\r\n]+)/);
    if (emailMatch && passMatch) {
      testPasswords[emailMatch[1].trim()] = passMatch[1].trim();
    }
  });
}

async function testAuth() {
  console.log('Testing signInWithPassword for Finance Lead...');
  const { data: authData, error: authErr } = await sb.auth.signInWithPassword({
    email: 'fl@lextria-demo.test',
    password: testPasswords['fl@lextria-demo.test'],
  });

  if (authErr) {
    console.error('Sign in failed:', authErr.message);
    return;
  }
  console.log('Finance Lead signed in successfully! User ID:', authData.user.id);

  const { data: quotes, error: qErr } = await sb.schema('finance').from('quotations_view').select('*');
  if (qErr) {
    console.error('Quotations view query error:', qErr.message);
  } else {
    console.log('Quotations view query success! Found:', quotes.length);
  }

  const { data: cat, error: catErr } = await sb.schema('finance').from('service_catalog').select('*');
  if (catErr) {
    console.error('Service catalog error:', catErr.message);
  } else {
    console.log('Service catalog query success! Found:', cat.length);
  }
}

testAuth();
