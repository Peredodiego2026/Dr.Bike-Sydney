import { createClient } from '@supabase/supabase-js';
// security handled inline

const sb = createClient(
  process.env.SUPABASE_URL || 'https://tgpipbloisahufaywhqb.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRncGlwYmxvaXNhaHVmYXl3aHFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MTM4NjgsImV4cCI6MjA5MzQ4OTg2OH0.P1lpqPVmW0HE3PwHeUhRw20eRP3ApdDGYuiwtJhRD9U'
);

export default async function handler(req, res) {
  if(req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Origin','*'); res.status(200).end(); return; }
  if(req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Access-Control-Allow-Origin','*');

  try {
    const { data, error } = await sb
      .from('bookings')
      .select('id, client_id, service_name, service_price, scheduled_date, scheduled_time, status, suburb, address, van_number, created_at, notes, mechanic_notes, client_rating, client_review, profiles(full_name, email, phone_number)')
      .order('created_at', { ascending: false })
      .limit(500);

    if(error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: error.message, details: error });
    }
    return res.status(200).json({ bookings: data || [], count: data?.length || 0 });
  } catch(e) {
    console.error('Handler error:', e);
    return res.status(500).json({ error: e.message, stack: e.stack?.slice(0,200) });
  }
}
