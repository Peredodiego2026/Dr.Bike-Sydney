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

  return res.status(200).json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
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

async function handleMechanicJobs(req, res) {
  const pin = req.body?.pin || '';
  const van = parseInt(req.body?.van) || 1;
  if (!pin || String(pin).trim().length < 4) return res.status(401).json({ error: 'PIN required' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

  const contactsResp = await fetch(`${SUPABASE_URL}/rest/v1/escalation_contacts?select=*`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!contactsResp.ok) return res.status(500).json({ error: 'Database error' });
  const contacts = await contactsResp.json();
  const mechanic = contacts.find(c => c.phone && c.phone.replace(/[\s+\-()\s]/g, '').slice(-4) === String(pin).trim());
  if (!mechanic) return res.status(401).json({ error: 'Invalid PIN' });

  const cols = 'id,client_id,client_name,client_email,client_phone,service_name,service_price,scheduled_date,scheduled_time,status,suburb,address,van_number,notes,mechanic_notes,mechanic_id,client_rating,client_review';
  const jobsResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?select=${cols}&or=(van_number.eq.${van},van_number.is.null)&order=scheduled_date.asc,scheduled_time.asc`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' } }
  );
  if (!jobsResp.ok) return res.status(500).json({ error: 'Failed to fetch jobs' });
  const jobs = await jobsResp.json();
  return res.status(200).json(jobs);
}

async function handleMechanicLocation(req, res) {
  const { pin, van_number, lat, lng } = req.body;
  if (!pin || String(pin).trim().length < 4) return res.status(401).json({ error: 'PIN required' });
  if (lat == null || lng == null) return res.status(400).json({ error: 'Location required' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

  const contactsResp = await fetch(`${SUPABASE_URL}/rest/v1/escalation_contacts?select=*`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!contactsResp.ok) return res.status(500).json({ error: 'Database error' });
  const contacts = await contactsResp.json();
  const mechanic = contacts.find(c => c.phone && c.phone.replace(/[\s+\-()\s]/g, '').slice(-4) === String(pin).trim());
  if (!mechanic) return res.status(401).json({ error: 'Invalid PIN' });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: existing } = await supabase.from('mechanic_locations')
    .select('id').eq('mechanic_id', mechanic.id).limit(1);

  if (existing && existing[0]) {
    await supabase.from('mechanic_locations')
      .update({ lat, lng, is_online: true, updated_at: new Date().toISOString() })
      .eq('mechanic_id', mechanic.id);
  } else {
    await supabase.from('mechanic_locations')
      .insert({ mechanic_id: mechanic.id, van_number: van_number || 1, lat, lng, is_online: true });
  }
  return res.status(200).json({ ok: true });
}

async function handleClientBookings(req, res) {
  const { access_token, client_id } = req.body;
  if (!access_token || !client_id) return res.status(400).json({ error: 'access_token and client_id required' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

  // Verify token server-side — confirms the token is valid and belongs to this user
  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${access_token}` },
  });
  if (!userResp.ok) return res.status(401).json({ error: 'Invalid or expired session' });
  const userData = await userResp.json();
  if (userData.id !== client_id) return res.status(403).json({ error: 'Forbidden' });

  const cols = 'id,service_name,service_price,callout_fee,scheduled_date,scheduled_time,address,status,client_rating,client_review,tracking_token,mechanic_id,notes';
  const bookingsResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?select=${cols}&client_id=eq.${client_id}&order=scheduled_date.desc`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  if (!bookingsResp.ok) return res.status(500).json({ error: 'Failed to fetch bookings' });
  const data = await bookingsResp.json();
  return res.status(200).json(data || []);
}

async function handleMechanicAccept(req, res) {
  const { pin, booking_id } = req.body;
  if (!pin || String(pin).trim().length < 4) return res.status(401).json({ error: 'PIN required' });
  if (!booking_id) return res.status(400).json({ error: 'booking_id required' });
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const contactsResp = await fetch(`${SUPABASE_URL}/rest/v1/escalation_contacts?select=*`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
  if (!contactsResp.ok) return res.status(500).json({ error: 'Database error' });
  const contacts = await contactsResp.json();
  const mechanic = contacts.find(c => c.phone && c.phone.replace(/[\s+\-()\s]/g, '').slice(-4) === String(pin).trim());
  if (!mechanic) return res.status(401).json({ error: 'Invalid PIN' });
  // mechanic_id FK points to profiles.id but mechanics use PIN auth (no profile row).
  // Skip mechanic_id write until schema FK is corrected to escalation_contacts.id.
  return res.status(200).json({ ok: true, mechanic_name: mechanic.name });
}

async function handleMechanicReject(req, res) {
  const { pin, booking_id } = req.body;
  if (!pin || String(pin).trim().length < 4) return res.status(401).json({ error: 'PIN required' });
  if (!booking_id) return res.status(400).json({ error: 'booking_id required' });
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const contactsResp = await fetch(`${SUPABASE_URL}/rest/v1/escalation_contacts?select=*`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
  if (!contactsResp.ok) return res.status(500).json({ error: 'Database error' });
  const contacts = await contactsResp.json();
  const mechanic = contacts.find(c => c.phone && c.phone.replace(/[\s+\-()\s]/g, '').slice(-4) === String(pin).trim());
  if (!mechanic) return res.status(401).json({ error: 'Invalid PIN' });
  const updateResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(booking_id)}`,
    { method: 'PATCH', headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'pending', mechanic_id: null }) }
  );
  if (!updateResp.ok) {
    const errText = await updateResp.text();
    console.error('reject patch error:', updateResp.status, errText);
    return res.status(500).json({ error: 'Failed to reject booking', detail: errText });
  }
  return res.status(200).json({ ok: true });
}

async function handleMechanicArrived(req, res) {
  const { pin, booking_id } = req.body;
  if (!pin || String(pin).trim().length < 4) return res.status(401).json({ error: 'PIN required' });
  if (!booking_id) return res.status(400).json({ error: 'booking_id required' });
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const contactsResp = await fetch(`${SUPABASE_URL}/rest/v1/escalation_contacts?select=*`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
  if (!contactsResp.ok) return res.status(500).json({ error: 'Database error' });
  const contacts = await contactsResp.json();
  const mechanic = contacts.find(c => c.phone && c.phone.replace(/[\s+\-()\s]/g, '').slice(-4) === String(pin).trim());
  if (!mechanic) return res.status(401).json({ error: 'Invalid PIN' });
  const updateResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(booking_id)}`,
    { method: 'PATCH', headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'inprogress', arrived_at: new Date().toISOString() }) }
  );
  if (!updateResp.ok) {
    const errText = await updateResp.text();
    console.error('arrived patch error:', updateResp.status, errText);
    return res.status(500).json({ error: 'Failed to mark arrived', detail: errText });
  }
  return res.status(200).json({ ok: true });
}

async function handleClientCancel(req, res) {
  const { access_token, booking_id, client_id } = req.body;
  if (!access_token || !booking_id || !client_id)
    return res.status(400).json({ error: 'access_token, booking_id, client_id required' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${access_token}` },
  });
  if (!userResp.ok) return res.status(401).json({ error: 'Invalid session' });
  const userData = await userResp.json();
  if (userData.id !== client_id) return res.status(403).json({ error: 'Forbidden' });

  const bkResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?select=id,status,client_id&id=eq.${encodeURIComponent(booking_id)}&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  if (!bkResp.ok) return res.status(500).json({ error: 'Database error' });
  const bkData = await bkResp.json();
  if (!bkData?.length) return res.status(404).json({ error: 'Booking not found' });
  const bk = bkData[0];
  if (bk.client_id !== client_id) return res.status(403).json({ error: 'Forbidden' });
  if (!['pending', 'confirmed'].includes(bk.status))
    return res.status(400).json({ error: 'Booking cannot be cancelled' });

  const updateResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(booking_id)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ status: 'cancelled' }),
    }
  );
  if (!updateResp.ok) return res.status(500).json({ error: 'Failed to cancel booking' });
  return res.status(200).json({ ok: true });
}

async function handleClientReschedule(req, res) {
  const { access_token, booking_id, client_id, scheduled_date, scheduled_time } = req.body;
  if (!access_token || !booking_id || !client_id || !scheduled_date || !scheduled_time)
    return res.status(400).json({ error: 'access_token, booking_id, client_id, scheduled_date, scheduled_time required' });

  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduled_date))
    return res.status(400).json({ error: 'Invalid date format (YYYY-MM-DD)' });
  if (!/^\d{2}:\d{2}$/.test(scheduled_time))
    return res.status(400).json({ error: 'Invalid time format (HH:MM)' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${access_token}` },
  });
  if (!userResp.ok) return res.status(401).json({ error: 'Invalid session' });
  const userData = await userResp.json();
  if (userData.id !== client_id) return res.status(403).json({ error: 'Forbidden' });

  const bkResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?select=id,status,client_id&id=eq.${encodeURIComponent(booking_id)}&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  if (!bkResp.ok) return res.status(500).json({ error: 'Database error' });
  const bkData = await bkResp.json();
  if (!bkData?.length) return res.status(404).json({ error: 'Booking not found' });
  const bk = bkData[0];
  if (bk.client_id !== client_id) return res.status(403).json({ error: 'Forbidden' });
  if (!['pending', 'confirmed'].includes(bk.status))
    return res.status(400).json({ error: 'Booking cannot be rescheduled' });

  const updateResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(booking_id)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ scheduled_date, scheduled_time }),
    }
  );
  if (!updateResp.ok) return res.status(500).json({ error: 'Failed to reschedule booking' });
  return res.status(200).json({ ok: true });
}

async function handleClientHistory(req, res) {
  const { pin, client_id, client_email, booking_id } = req.body;
  if (!pin || String(pin).trim().length < 4) return res.status(401).json({ error: 'PIN required' });
  if (!client_id && !client_email && !booking_id) return res.status(400).json({ error: 'client_id, client_email or booking_id required' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

  const contactsResp = await fetch(`${SUPABASE_URL}/rest/v1/escalation_contacts?select=*`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!contactsResp.ok) return res.status(500).json({ error: 'Database error' });
  const contacts = await contactsResp.json();
  const mechanic = contacts.find(c => c.phone && c.phone.replace(/[\s+\-()\s]/g, '').slice(-4) === String(pin).trim());
  if (!mechanic) return res.status(401).json({ error: 'Invalid PIN' });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const cols = 'id,service_name,service_price,scheduled_date,status,client_rating,client_review,mechanic_notes';
  let query = supabase.from('bookings').select(cols).eq('status', 'completed')
    .order('scheduled_date', { ascending: false }).limit(10);

  if (client_id) query = query.eq('client_id', client_id);
  else if (client_email) query = query.eq('client_email', client_email);
  else query = query.eq('id', booking_id);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json(data || []);
}

async function handleMechanicUpdateStatus(req, res) {
  const { pin, booking_id, status } = req.body;
  if (!pin || String(pin).trim().length < 4) return res.status(401).json({ error: 'PIN required' });
  if (!booking_id || !status) return res.status(400).json({ error: 'booking_id and status required' });

  const ALLOWED = ['pending', 'confirmed', 'enroute', 'in_progress', 'completed', 'cancelled'];
  if (!ALLOWED.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

  const contactsResp = await fetch(`${SUPABASE_URL}/rest/v1/escalation_contacts?select=*`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!contactsResp.ok) return res.status(500).json({ error: 'Database error' });
  const contacts = await contactsResp.json();
  const mechanic = contacts.find(c => c.phone && c.phone.replace(/[\s+\-()\s]/g, '').slice(-4) === String(pin).trim());
  if (!mechanic) return res.status(401).json({ error: 'Invalid PIN' });

  const updateResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(booking_id)}`,
    {
      method: 'PATCH',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ status, ...(status === 'enroute' ? { mechanic_id: mechanic.id } : {}) }),
    }
  );
  if (!updateResp.ok) {
    const errText = await updateResp.text();
    console.error('update-status error:', updateResp.status, errText);
    return res.status(500).json({ error: 'Failed to update booking', detail: errText });
  }
  return res.status(200).json({ ok: true });
}

async function handlePublicTrack(req, res) {
  const { tracking_token, booking_id } = req.body;
  if (!tracking_token && !booking_id) return res.status(400).json({ error: 'tracking_token or booking_id required' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const cols = 'id,status,scheduled_date,scheduled_time,service_name,service_price,address,van_number,mechanic_id,mechanic_notes,parts_used,next_service_date,tracking_token';
  const filter = tracking_token
    ? `tracking_token=eq.${encodeURIComponent(tracking_token)}`
    : `id=eq.${encodeURIComponent(booking_id)}`;

  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?select=${cols}&${filter}&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  if (!resp.ok) return res.status(500).json({ error: 'Database error' });
  const data = await resp.json();
  if (!data?.length) return res.status(404).json({ error: 'Booking not found' });
  const booking = data[0];

  // Also fetch mechanic location server-side (bypasses RLS on mechanic_locations)
  let mechanic_location = null;
  if (booking.mechanic_id) {
    const locResp = await fetch(
      `${SUPABASE_URL}/rest/v1/mechanic_locations?select=lat,lng,updated_at&mechanic_id=eq.${encodeURIComponent(booking.mechanic_id)}&order=updated_at.desc&limit=1`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    if (locResp.ok) {
      const locData = await locResp.json();
      if (locData?.length && locData[0].lat && locData[0].lng) {
        mechanic_location = { lat: locData[0].lat, lng: locData[0].lng };
      }
    }
  }
  return res.status(200).json({ ...booking, mechanic_location });
}

export default async function handler(req, res) {
  const role = req.body?.type || req.body?.role || req.query?.role || 'admin';
  const rateMax = role.startsWith('mechanic-') ? 30 : role === 'public-track' ? 20 : 5;
  if (await guard(req, res, { method: 'POST', rateMax, rateWindow: 60000 })) return;

  if (role === 'public-track') return handlePublicTrack(req, res);
  if (role === 'mechanic-update-status') return handleMechanicUpdateStatus(req, res);
  if (role === 'mechanic-accept') return handleMechanicAccept(req, res);
  if (role === 'mechanic-reject') return handleMechanicReject(req, res);
  if (role === 'mechanic-arrived') return handleMechanicArrived(req, res);
  if (role === 'mechanic') return handleMechanic(req, res);
  if (role === 'mechanic-jobs') return handleMechanicJobs(req, res);
  if (role === 'mechanic-location') return handleMechanicLocation(req, res);
  if (role === 'client-cancel') return handleClientCancel(req, res);
  if (role === 'client-reschedule') return handleClientReschedule(req, res);
  if (role === 'client-history') return handleClientHistory(req, res);
  if (role === 'client-bookings') return handleClientBookings(req, res);
  return handleAdmin(req, res);
}
