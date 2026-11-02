import urllib.request
import json

SUPABASE_URL = 'https://eafciegebhuhoneypsqy.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhZmNpZWdlYmh1aG9uZXlwc3F5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTA5NTU1NywiZXhwIjoyMTA2NjcxNTU3fQ.rxJJ-BO6bAeJYBu-tonvwxNZ3rh1D5ugjIpQMPk4qNo'

req = urllib.request.Request(
    f'{SUPABASE_URL}/rest/v1/service_catalog?select=*',
    headers={'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}', 'Accept-Profile': 'finance'}
)
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode())
    print('service_catalog count:', len(data))
    for d in data:
        print(f"{d.get('service_code')}: {d.get('name')} | Prof Fee: {d.get('standard_prof_fee')} | Govt Fee: {d.get('standard_govt_fee')}")

req2 = urllib.request.Request(
    f'{SUPABASE_URL}/rest/v1/stage_templates?select=*',
    headers={'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}', 'Accept-Profile': 'finance'}
)
with urllib.request.urlopen(req2) as resp2:
    data2 = json.loads(resp2.read().decode())
    print('\nstage_templates count:', len(data2))
    for d in data2:
        print(f"\nTemplate: {d.get('name')}:")
        for s in d.get('items', []):
            print(f"  Stage: {s.get('stage_key')} - {s.get('name')} ({s.get('percent')}%) | Trigger: {s.get('trigger_event_code')}")
