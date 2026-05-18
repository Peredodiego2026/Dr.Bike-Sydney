import { createClient } from '@supabase/supabase-js';
import { guard } from './_security.js';

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY  // service role key - bypass RLS
);

export default async function handler(req, res) {
  if(guard(req, res, { rateMax: 60, rateWindow: 60000 })) return;
  if(req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { data, error } = await sb
      .from('bookings')
      .select('*, profiles(full_name, email, phone_number)')
      .order('created_at', { ascending: false })
      .limit(500);

    if(error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ bookings: data || [] });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
