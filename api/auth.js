// Handles admin auth (?role=admin) and mechanic auth (?role=mechanic).
// Vercel rewrites map /api/admin-auth and /api/mechanic-auth to this file.
import { createClient } from '@supabase/supabase-js';
import { guard } from './_security.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tgpipbloisahufaywhqb.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

async function handleAdmin(req, res) {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing credentials' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  console.log('Admin login attempt:', email, 'Error:', error?.message);

  if (error) {
    console.error('Admin auth error:', error.message);
    return res.status(401).json({ error: error.message });
  }

  return res.status(200).json({ access_token: data.session.access_token });
}

async function handleMechanic(req, res) {
  const { pin } = req.body;
  if (!pin || String(pin).trim().length < 4) return res.status(400).json({ error: 'PIN required' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/escalation_contacts?select=*`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!resp.ok) return res.status(500).json({ error: 'Database error' });

  const contacts = await resp.json();
  const mechanic = contacts.find(c => c.phone && c.phone.replace(/[\s+\-()\s]/g, '').slice(-4) === String(pin).trim());
  if (!mechanic) return res.status(401).json({ error: 'Invalid PIN' });
  return res.status(200).json({ id: mechanic.id, name: mechanic.name, phone: mechanic.phone, role: mechanic.role || 'mechanic' });
}

export default async function handler(req, res) {
  if (await guard(req, res, { method: 'POST', rateMax: 5, rateWindow: 60000 })) return;

  const role = req.body?.type || req.query?.role || 'admin';
  if (role === 'mechanic') return handleMechanic(req, res);
  return handleAdmin(req, res);
}
