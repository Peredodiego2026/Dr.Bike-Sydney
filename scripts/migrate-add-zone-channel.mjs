// Run once: node scripts/migrate-add-zone-channel.mjs <service_role_key>
// Get key: Supabase Dashboard → Project Settings → API → service_role (secret)
const serviceKey = process.argv[2];
const SUPABASE_URL = 'https://tgpipbloisahufaywhqb.supabase.co';
if (!serviceKey) { console.error('Usage: node scripts/migrate-add-zone-channel.mjs <service_role_key>'); process.exit(1); }
const sqls = [
  `ALTER TABLE escalation_contacts ADD COLUMN IF NOT EXISTS zone text DEFAULT 'all'`,
  `ALTER TABLE escalation_contacts ADD COLUMN IF NOT EXISTS channel text DEFAULT 'sms'`,
];
for (const sql of sqls) {
  console.log('Running:', sql);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql }),
  });
  console.log('→', res.status, await res.text());
}
console.log('Done!');
