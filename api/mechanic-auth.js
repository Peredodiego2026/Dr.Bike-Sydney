// api/mechanic-auth.js - Mechanic PIN verification via server-side Supabase query
// Verifies PIN against escalation_contacts (last 4 digits of mechanic phone).
// Uses service_role key so it bypasses RLS.
import { guard } from './_security.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tgpipbloisahufaywhqb.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

export default async function handler(req, res) {
  if (guard(req, res, { method: 'POST', rateMax: 10, rateWindow: 60000 })) return;

  const { pin } = req.body;
  if (!pin || String(pin).trim().length < 4) return res.status(400).json({ error: 'PIN required' });

  const resp = await fetch(`${SUPABASE_URL}/rest/v1/escalation_contacts?select=*`, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });

  if (!resp.ok) return res.status(500).json({ error: 'Database error' });

  const contacts = await resp.json();
  const mechanic = contacts.find(c =>
    c.phone && c.phone.replace(/[\s+\-()\s]/g, '').slice(-4) === String(pin).trim()
  );

  if (!mechanic) return res.status(401).json({ error: 'Invalid PIN' });

  return res.status(200).json({
    id: mechanic.id,
    name: mechanic.name,
    phone: mechanic.phone,
    role: mechanic.role || 'mechanic',
  });
}
