// api/admin-auth.js - Admin authentication via Supabase Auth
// Admin user must be created in:
//   Supabase Dashboard -> Authentication -> Users -> Add User
//   Use the admin email + a strong password, then share credentials securely.
import { guard } from './_security.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tgpipbloisahufaywhqb.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_KEY;

export default async function handler(req, res) {
  if (await guard(req, res, { method: 'POST', rateMax: 5, rateWindow: 60000 })) return;

  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const resp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await resp.json();
  if (!resp.ok) return res.status(401).json({ error: 'Invalid credentials' });

  return res.status(200).json({ access_token: data.access_token });
}
