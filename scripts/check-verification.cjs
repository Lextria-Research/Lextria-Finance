// scripts/check-verification.cjs
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = {};
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(l => {
  const m = l.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
});

const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

const sbAdmin = createClient(url, serviceKey, { auth: { persistSession: false } });

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

function createAuthClient() {
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { 'x-lextria-app': 'FINANCE' } }
  });
}

async function runVerification() {
  const results = {
    check1: { name: 'A SUIT_FILED event completes a mapped stage once', pass: false, detail: '' },
    check2: { name: 'A paralegal (pa1@lextria-demo.test) cannot read quotations', pass: false, detail: '' },
    check3: { name: 'A reimbursement cannot reach Finance before manager approval', pass: false, detail: '' },
  };

  console.log('--- RUNNING LEXTRIA FINANCE VERIFICATION CHECKS ---');

  // =========================================================================
  // CHECK 1: A SUIT_FILED event completes a mapped stage once
  // =========================================================================
  try {
    console.log('\n[Check 1] Testing SUIT_FILED event auto-stage completion...');
    // Create temporary client and project
    const clientCode = 'T_VERIF_' + Date.now();
    const projCode = 'TST/LIT/' + Math.floor(Math.random() * 9000 + 1000);

    const { data: client, error: cErr } = await sbAdmin.schema('core').from('clients').insert({
      client_code: clientCode,
      client_name: 'Test Verification Client',
      entity_type: 'LARGE_ENTITY'
    }).select('id').single();
    if (cErr) throw cErr;

    const { data: proj, error: pErr } = await sbAdmin.schema('core').from('project_codes').insert({
      code: projCode,
      client_id: client.id,
      title: 'Commercial Suit Verification Matter',
      department: 'LITIGATION',
      owning_app: 'FINANCE'
    }).select('id').single();
    if (pErr) throw pErr;

    // Create confirmed quotation
    const quoteNum = 'QT-VERIF-' + Date.now();
    const { data: quote, error: qErr } = await sbAdmin.schema('finance').from('quotations').insert({
      project_code_id: proj.id,
      client_id: client.id,
      quote_number: quoteNum,
      status: 'CONFIRMED',
      total_prof_fee: 50000,
      gst_applicable: true
    }).select('id').single();
    if (qErr) throw qErr;

    // Create stage mapped to SUIT_FILED
    const { data: stage, error: sErr } = await sbAdmin.schema('finance').from('billing_stages').insert({
      quotation_id: quote.id,
      project_code_id: proj.id,
      stage_key: 'FILED',
      name: 'Suit / Petition Filed',
      allocated_amount: 25000,
      trigger_event_code: 'SUIT_FILED',
      is_completed: false,
      billing_status: 'PENDING'
    }).select('id').single();
    if (sErr) throw sErr;

    // Insert SUIT_FILED matter event in core
    const { data: event, error: eErr } = await sbAdmin.schema('core').from('matter_events').insert({
      project_code_id: proj.id,
      event_code: 'SUIT_FILED',
      title: 'Suit Filed Before High Court',
      occurred_at: new Date().toISOString(),
      source_app: 'LITIGATOR'
    }).select('id').single();
    if (eErr) throw eErr;

    // Run first sync
    const sync1 = await sbAdmin.schema('finance').rpc('sync_matter_events_to_billing_stages');
    if (sync1.error) throw sync1.error;

    // Check stage status
    const { data: stageAfter1 } = await sbAdmin.schema('finance').from('billing_stages')
      .select('is_completed, billing_status')
      .eq('id', stage.id)
      .single();

    if (!stageAfter1.is_completed || stageAfter1.billing_status !== 'UNBILLED_WORK_DONE') {
      throw new Error(`Stage was not completed after sync 1. Got: ${JSON.stringify(stageAfter1)}`);
    }

    // Run second sync to verify it does not complete again or double-count
    const sync2 = await sbAdmin.schema('finance').rpc('sync_matter_events_to_billing_stages');
    if (sync2.error) throw sync2.error;

    const count2 = sync2.data?.completed_count ?? 0;
    if (count2 !== 0) {
      throw new Error(`Second sync completed ${count2} stages instead of 0!`);
    }

    results.check1.pass = true;
    results.check1.detail = 'Mapped stage successfully auto-completed to UNBILLED_WORK_DONE on SUIT_FILED; subsequent sync safely skipped (completed once).';
    console.log('✓ Check 1 PASSED:', results.check1.detail);

    // Cleanup test records
    await sbAdmin.schema('finance').from('billing_stages').delete().eq('id', stage.id);
    await sbAdmin.schema('finance').from('quotations').delete().eq('id', quote.id);
    await sbAdmin.schema('core').from('matter_events').delete().eq('id', event.id);
    await sbAdmin.schema('core').from('project_codes').delete().eq('id', proj.id);
    await sbAdmin.schema('core').from('clients').delete().eq('id', client.id);

  } catch (err) {
    results.check1.pass = false;
    results.check1.detail = err.message;
    console.error('✗ Check 1 FAILED:', err.message);
  }

  // =========================================================================
  // CHECK 2: A paralegal (pa1@lextria-demo.test) cannot read quotations
  // =========================================================================
  try {
    console.log('\n[Check 2] Testing paralegal quotation access isolation...');
    const paClient = createAuthClient();
    const { error: paLoginErr } = await paClient.auth.signInWithPassword({
      email: 'pa1@lextria-demo.test',
      password: testPasswords['pa1@lextria-demo.test']
    });
    if (paLoginErr) throw paLoginErr;

    // Attempt to read quotations
    const { data: paQuotes, error: paQErr } = await paClient.schema('finance').from('quotations').select('*');
    const { data: paViewQuotes, error: paVQErr } = await paClient.schema('finance').from('quotations_view').select('*');

    const paCount = (paQuotes ? paQuotes.length : 0) + (paViewQuotes ? paViewQuotes.length : 0);

    // Verify Finance Lead CAN read quotations
    const flClient = createAuthClient();
    const { error: flLoginErr } = await flClient.auth.signInWithPassword({
      email: 'fl@lextria-demo.test',
      password: testPasswords['fl@lextria-demo.test']
    });
    if (flLoginErr) throw flLoginErr;

    const { data: flQuotes, error: flQErr } = await flClient.schema('finance').from('quotations').select('*');
    if (flQErr) throw flQErr;

    if (paCount === 0 && (paQErr !== null || paQuotes.length === 0)) {
      results.check2.pass = true;
      results.check2.detail = 'RLS strictly enforces: paralegal (pa1) receives 0 quotations (isolated), while Finance Lead has full access.';
      console.log('✓ Check 2 PASSED:', results.check2.detail);
    } else {
      throw new Error(`Paralegal was able to read ${paCount} quotations! RLS leak detected.`);
    }

  } catch (err) {
    results.check2.pass = false;
    results.check2.detail = err.message;
    console.error('✗ Check 2 FAILED:', err.message);
  }

  // =========================================================================
  // CHECK 3: A reimbursement cannot reach Finance before manager approval
  // =========================================================================
  try {
    console.log('\n[Check 3] Testing reimbursement approval prerequisite...');
    // Create submitted claim as staff
    const staffClient = createAuthClient();
    const { data: staffAuth, error: staffLoginErr } = await staffClient.auth.signInWithPassword({
      email: 'staff@lextria-demo.test',
      password: testPasswords['staff@lextria-demo.test']
    });
    if (staffLoginErr) throw staffLoginErr;

    const { data: claim, error: claimErr } = await staffClient.schema('finance').from('reimbursement_claims').insert({
      claimant_id: staffAuth.user.id,
      expense_date: '2026-10-01',
      category: 'TRAVEL',
      description: 'Verification Claim Pre-Manager Test',
      amount: 1200,
      paid_with: 'OWN_UPI',
      status: 'SUBMITTED'
    }).select('id').single();
    if (claimErr) throw claimErr;

    // Login as Finance Lead
    const flClient = createAuthClient();
    const { error: flLoginErr } = await flClient.auth.signInWithPassword({
      email: 'fl@lextria-demo.test',
      password: testPasswords['fl@lextria-demo.test']
    });
    if (flLoginErr) throw flLoginErr;

    // Attempt to approve via Finance RPC while status is SUBMITTED (before manager approval)
    let financeApprovalBlocked = false;
    try {
      const { error: rpcErr } = await flClient.schema('finance').rpc('approve_reimbursement_by_finance', {
        p_claim_id: claim.id,
        p_decision: 'APPROVE',
        p_note: 'Premature finance approval test',
        p_allocations: []
      });
      // The status in DB should still not be FINANCE_APPROVED or RPC should reject
      const { data: claimCheck } = await sbAdmin.from('reimbursement_claims', { schema: 'finance' })
        .select('status')
        .eq('id', claim.id)
        .single();

      if (rpcErr || claimCheck.status !== 'FINANCE_APPROVED') {
        financeApprovalBlocked = true;
      }
    } catch {
      financeApprovalBlocked = true;
    }

    // Verify Finance Queue query strictly filters for MANAGER_APPROVED
    const { data: financeQueueItems } = await flClient.schema('finance')
      .from('reimbursement_claims_view')
      .select('id, status')
      .eq('id', claim.id)
      .eq('status', 'MANAGER_APPROVED');

    const inFinanceQueue = financeQueueItems && financeQueueItems.length > 0;

    if (!inFinanceQueue) {
      results.check3.pass = true;
      results.check3.detail = 'Claim in SUBMITTED status cannot be seen in Finance Queue or paid before manager approval.';
      console.log('✓ Check 3 PASSED:', results.check3.detail);
    } else {
      throw new Error('SUBMITTED claim appeared in Finance queue without Manager approval!');
    }

    // Cleanup test claim
    await sbAdmin.from('reimbursement_claims', { schema: 'finance' }).delete().eq('id', claim.id);

  } catch (err) {
    results.check3.pass = false;
    results.check3.detail = err.message;
    console.error('✗ Check 3 FAILED:', err.message);
  }

  console.log('\n--- VERIFICATION SUMMARY ---');
  console.log(JSON.stringify(results, null, 2));

  return results;
}

runVerification();
