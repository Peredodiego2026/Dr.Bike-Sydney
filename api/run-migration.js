// ONE-TIME migration endpoint — adds zone + channel columns to escalation_contacts
// Call once from browser: POST /api/run-migration  (admin only, delete after use)
import { createClient } from '@supabase/supabase-js';
import { guard, sanitize, sanitizeObj, rateLimit } from './_security.js';

export default async function handler(req, res) {
  if(guard(req, res, { rateMax: 3, rateWindow: 300000 })) return; // 3/5min migration
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // DISABLED — migration already ran, endpoint locked
  return res.status(410).json({ error: 'Migration endpoint disabled. Run SQL directly in Supabase.' });

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
