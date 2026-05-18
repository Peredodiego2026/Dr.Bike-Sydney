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

  const { van } = req.query;

  try {
    let query = sb
      .from('bookings')
      .select('*, profiles(full_name, email, phone, phone_number)')
      .order('scheduled_date')
      .order('scheduled_time');
    
    if(van) query = query.eq('van_number', parseInt(van));

    const { data, error } = await query;
    if(error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ jobs: data || [] });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
