export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://drbikesydney.com.au');
  res.setHeader('Cache-Control', 's-maxage=300');

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  // Schema: bookings table
  // rating (integer 1-5), review_comment (text), client_name (text),
  // service_name (text), profiles(full_name) via join
  const { data, error } = await supabase
    .from('bookings')
    .select('rating, review_comment, client_name, service_name, created_at, profiles(full_name)')
    .not('rating', 'is', null)
    .not('review_comment', 'is', null)
    .gte('rating', 4)
    .order('created_at', { ascending: false })
    .limit(9);

  if (error) return res.status(500).json({ error: error.message });

  const reviews = (data || []).map(r => ({
    review_rating: r.rating,
    review_comment: r.review_comment,
    client_name: r.client_name || r.profiles?.full_name || null,
    service_type: r.service_name || null,
    created_at: r.created_at,
  }));

  return res.status(200).json({ reviews });
}
