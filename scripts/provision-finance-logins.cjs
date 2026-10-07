const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const envPath = path.resolve('.env.local');
const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
const env = {};
for (const line of envContent.split('\n')) {
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

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function generatePassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!#%*+';
  let pwd = 'Lx!';
  const bytes = crypto.randomBytes(16);
  for (let i = 0; i < 16; i++) {
    pwd += chars[bytes[i] % chars.length];
  }
  return pwd;
}

const FINANCE_USERS = [
  {
    roleName: 'Finance Lead',
    email: 'fl@lextria-demo.test',
    role: 'FINANCE',
    department: 'FINANCE',
    displayName: 'Ramesh Patel (Finance Lead)',
    isFinanceLead: true,
    presetPwd: 'Lx!+r9Lw#cJrM2#Jtqj',
  },
  {
    roleName: 'Super Admin',
    email: 'sa1@lextria-demo.test',
    role: 'SUPER_ADMIN',
    department: 'MANAGEMENT',
    displayName: 'Ananya Sharma (Partner / Super Admin)',
    isFinanceLead: false,
    presetPwd: 'Lx!2A22dDQrY7KWjamc',
  },
  {
    roleName: 'Department Admin',
    email: 'lithead@lextria-demo.test',
    role: 'DEPT_ADMIN',
    department: 'LITIGATION',
    displayName: 'Sanjay Deshmukh (Litigation Head)',
    isFinanceLead: false,
    presetPwd: 'Lx!+KFU7*m#ggKKpf!9',
  },
  {
    roleName: 'Paralegal',
    email: 'pa1@lextria-demo.test',
    role: 'PARALEGAL',
    department: 'PARALEGAL',
    displayName: 'Priya Sharma (Paralegal)',
    isFinanceLead: false,
    presetPwd: 'Lx!P@r4l3g4l!99',
  },
  {
    roleName: 'Staff Member',
    email: 'staff@lextria-demo.test',
    role: 'STAFF',
    department: 'LITIGATION',
    displayName: 'Vikram Malhotra (Staff - Reports to Sanjay)',
    isFinanceLead: false,
    reportsToEmail: 'lithead@lextria-demo.test',
    presetPwd: 'Lx!St4ffM3mb3r!88',
  },
];

async function main() {
  console.log('Synchronizing test accounts with Supabase Auth and core.profiles...');
  const { data: userList, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) {
    console.error('List users failed:', listErr.message);
    process.exit(1);
  }

  const userMap = new Map();
  for (const u of userList.users) {
    if (u.email) userMap.set(u.email.toLowerCase(), u.id);
  }

  // Get department admin user id for reports_to
  let deptAdminId = userMap.get('lithead@lextria-demo.test');

  const outputLines = [
    '# Lextria Finance — Test Logins',
    '# DO NOT COMMIT TO GIT (git-ignored)',
    '# Generated: ' + new Date().toISOString(),
    '',
  ];

  for (const item of FINANCE_USERS) {
    const email = item.email.toLowerCase();
    const password = item.presetPwd || generatePassword();
    let userId = userMap.get(email);

    if (!userId) {
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          display_name: item.displayName,
          role: item.role,
          department: item.department,
        },
      });
      if (createErr || !created.user) {
        console.error(`Failed to create ${email}:`, createErr?.message);
        continue;
      }
      userId = created.user.id;
      userMap.set(email, userId);
      console.log(`Created auth user: ${email}`);
    } else {
      await supabase.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
        user_metadata: {
          display_name: item.displayName,
          role: item.role,
          department: item.department,
        },
      });
      console.log(`Updated auth password for: ${email}`);
    }

    if (email === 'lithead@lextria-demo.test') {
      deptAdminId = userId;
    }

    // Upsert into core.profiles
    const profilePayload = {
      id: userId,
      email,
      display_name: item.displayName,
      role: item.role,
      department: item.department,
      is_finance_lead: Boolean(item.isFinanceLead),
      active: true,
    };
    if (item.reportsToEmail && deptAdminId) {
      profilePayload.reports_to = deptAdminId;
    }

    const { error: profErr } = await supabase
      .schema('core')
      .from('profiles')
      .upsert(profilePayload, { onConflict: 'id' });

    if (profErr) {
      console.error(`Profile upsert error for ${email}:`, profErr.message);
    } else {
      console.log(`Profile synced in core.profiles for: ${email}`);
    }

    outputLines.push(
      `Role: ${item.roleName.padEnd(20)} | Email: ${email.padEnd(30)} | Password: ${password}`
    );
  }

  fs.writeFileSync('test-logins.txt', outputLines.join('\n') + '\n', 'utf8');
  console.log('SUCCESS: test-logins.txt written safely (git-ignored).');
}

main().catch(console.error);
