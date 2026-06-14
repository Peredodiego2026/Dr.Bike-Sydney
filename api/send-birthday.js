import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://tgpipbloisahufaywhqb.supabase.co',
  process.env.SUPABASE_SERVICE_KEY
);

const BASE_URL = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://drbikesydney.com.au';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = (req.headers.authorization || '').replace('Bearer ', '') || req.query?.key;
    if (provided !== secret) return res.status(401).json({ error: 'Unauthorized' });
  }

  const today = new Date();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const thisYear = today.getFullYear();

  const { data: profiles, error } = await sb
    .from('profiles')
    .select('id, full_name, email, birthday, birthday_promo_sent_year')
    .not('birthday', 'is', null)
    .not('email', 'is', null);

  if (error) return res.status(500).json({ error: error.message });
  if (!profiles?.length) return res.status(200).json({ sent: 0, message: 'No profiles with birthday' });

  const targets = profiles.filter(p => {
    const bday = p.birthday;
    if (!bday) return false;
    const [, bMm, bDd] = bday.split('-');
    return bMm === mm && bDd === dd && p.birthday_promo_sent_year !== thisYear;
  });

  if (!targets.length) return res.status(200).json({ sent: 0, message: 'No birthdays today' });

  let sent = 0;
  for (const profile of targets) {
    const name = profile.full_name || profile.email.split('@')[0];
    const r = await fetch(`${BASE_URL}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-token': process.env.INTERNAL_API_SECRET || '' },
      body: JSON.stringify({ to: profile.email, name, type: 'birthday_promo' }),
    }).catch(() => ({ ok: false }));
    if (r.ok) {
      await sb.from('profiles').update({ birthday_promo_sent_year: thisYear }).eq('id', profile.id);
      sent++;
    }
  }
  return res.status(200).json({ sent, checked: targets.length });
}
