// ONE-TIME migration endpoint — adds zone + channel columns to escalation_contacts
// Call once from browser: POST /api/run-migration  (admin only, delete after use)
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Simple admin guard
  const { secret } = req.body;
  if (secret !== 'drbike-migrate-2026') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabaseUrl  = process.env.SUPABASE_URL  || 'https://tgpipbloisahufaywhqb.supabase.co';
  const serviceKey   = process.env.SUPABASE_SERVICE_KEY;

  if (!serviceKey) {
    return res.status(500).json({ 
      error: 'SUPABASE_SERVICE_KEY not set in Vercel env vars',
      hint: 'Add SUPABASE_SERVICE_KEY in Vercel → Settings → Environment Variables. Get it from Supabase → Project Settings → API → service_role key'
    });
  }

  const sb = createClient(supabaseUrl, serviceKey);

  const migrations = [
    `ALTER TABLE escalation_contacts ADD COLUMN IF NOT EXISTS zone text DEFAULT 'all'`,
    `ALTER TABLE escalation_contacts ADD COLUMN IF NOT EXISTS channel text DEFAULT 'sms'`,
    `COMMENT ON COLUMN escalation_contacts.zone IS '1 = Van 1, 2 = Van 2, all = all zones'`,
    `COMMENT ON COLUMN escalation_contacts.channel IS 'sms | whatsapp | both'`,
  ];

  const results = [];
  for (const sql of migrations) {
    const { error } = await sb.rpc('exec_sql', { sql }).catch(() => ({ error: { message: 'rpc not available' } }));
    if (error) {
      // Try direct query via pg REST
      results.push({ sql: sql.slice(0, 60), status: 'skipped (use SQL Editor)', error: error.message });
    } else {
      results.push({ sql: sql.slice(0, 60), status: 'ok' });
    }
  }

  return res.status(200).json({ 
    message: 'Migration attempted. Check results below.',
    results,
    manualSQL: `
-- If auto-migration failed, run this in Supabase SQL Editor:
ALTER TABLE escalation_contacts 
  ADD COLUMN IF NOT EXISTS zone text DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS channel text DEFAULT 'sms';
    `.trim()
  });
}
