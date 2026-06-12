import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://tgpipbloisahufaywhqb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRncGlwYmxvaXNhaHVmYXl3aHFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MTM4NjgsImV4cCI6MjA5MzQ4OTg2OH0.P1lpqPVmW0HE3PwHeUhRw20eRP3ApdDGYuiwtJhRD9U';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Mock data (fallback when tables don't exist or network fails) ──────────────
const MOCK_SERVICES = [
  { id: '1', name: 'Tune-Up',          price: 109, description: 'Gears, brakes, wheels trued + safety check', duration: '~1 hour' },
  { id: '2', name: 'Standard Service', price: 149, description: 'Full tune-up + drivetrain clean',             duration: '~1.5 hours' },
  { id: '3', name: 'Major Service',    price: 199, description: 'Comprehensive overhaul + parts check',        duration: '~2.5 hours' },
  { id: '4', name: 'Ultimate Overhaul',price: 369, description: 'Complete rebuild, all bearings serviced',     duration: '~4 hours' },
];

const MOCK_SLOTS = ['8:00 AM','9:00 AM','10:00 AM','11:00 AM','1:00 PM','2:00 PM','3:00 PM','4:00 PM'];

const _d0 = new Date();
const _dateStr = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const _daysAgo = n => { const d = new Date(_d0); d.setDate(d.getDate() - n); return _dateStr(d); };
const MOCK_BOOKINGS = [
  { id: 'mock-1', service_name: 'Tune-Up',          scheduled_date: _dateStr(_d0), scheduled_time: '10:00 AM', total_price: 109, status: 'confirmed',  rating: null },
  { id: 'mock-2', service_name: 'Standard Service',  scheduled_date: _daysAgo(7),  scheduled_time: '2:00 PM',  total_price: 149, status: 'completed',  rating: 5    },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
export async function getServices() {
  try {
    const { data, error } = await sb.from('services').select('*').order('price');
    if (error || !data?.length) return MOCK_SERVICES;
    return data;
  } catch {
    return MOCK_SERVICES;
  }
}

export async function getAvailableSlots(date, serviceId) {
  try {
    const { data, error } = await sb
      .from('availability')
      .select('time_slot, available')
      .eq('date', date)
      .eq('service_id', serviceId);
    if (error || !data?.length) return MOCK_SLOTS.map(t => ({ time: t, available: true }));
    return data.map(r => ({ time: r.time_slot, available: r.available }));
  } catch {
    return MOCK_SLOTS.map(t => ({ time: t, available: true }));
  }
}

export async function createBooking(bookingData) {
  const { data, error } = await sb.from('bookings').insert([bookingData]).select().single();
  if (error) throw error;
  return data;
}

export async function getMechanicInfo(mechanicId) {
  try {
    const { data, error } = await sb.from('escalation_contacts').select('*').eq('id', mechanicId).single();
    if (error) return { name: 'Your Mechanic', phone: '0433 963 250' };
    return data;
  } catch {
    return { name: 'Your Mechanic', phone: '0433 963 250' };
  }
}

export async function getBookingStatus(bookingId) {
  const { data, error } = await sb.from('bookings').select('*').eq('id', bookingId).single();
  if (error) throw error;
  return data;
}

export async function submitReview(bookingId, rating, comment) {
  const { data, error } = await sb
    .from('bookings')
    .update({ rating, review_comment: comment, reviewed_at: new Date().toISOString() })
    .eq('id', bookingId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUp(email, password, name) {
  const { data, error } = await sb.auth.signUp({
    email, password,
    options: { data: { full_name: name } },
  });
  if (error) throw error;
  return data;
}

export function subscribeToMechanicLocation(bookingId, callback) {
  let mockLat = -33.820, mockLng = 151.180;
  const targetLat = -33.8688, targetLng = 151.2093;
  let useRealData = false;

  let channel = null;
  try {
    channel = sb.channel(`mechanic-${bookingId || 'demo'}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'mechanic_locations',
        filter: `booking_id=eq.${bookingId}`,
      }, payload => {
        const { latitude, longitude } = payload.new || {};
        if (latitude && longitude) { useRealData = true; callback({ latitude, longitude }); }
      })
      .subscribe();
  } catch { /* no realtime available */ }

  // Mock: slowly move mechanic toward client (used while no real data)
  const interval = setInterval(() => {
    if (useRealData) return;
    mockLat += (targetLat - mockLat) * 0.08;
    mockLng += (targetLng - mockLng) * 0.08;
    callback({ latitude: mockLat, longitude: mockLng });
  }, 3000);

  return () => {
    clearInterval(interval);
    if (channel) try { sb.removeChannel(channel); } catch {}
  };
}

export async function getMyBookings() {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return MOCK_BOOKINGS;
    const { data, error } = await sb
      .from('bookings')
      .select('*')
      .eq('client_id', user.id)
      .order('scheduled_date', { ascending: false });
    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}
