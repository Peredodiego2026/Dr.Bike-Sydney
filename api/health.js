// api/health.js v2 — Health check endpoint for monitoring
// GET /api/health → { status: 'ok', timestamp, version }

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const checks = {};
  let allOk = true;

  // Check Supabase connectivity
  try {
    const supabaseUrl = process.env.SUPABASE_URL || 'https://tgpipbloisahufaywhqb.supabase.co';
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
    if (!supabaseKey) throw new Error('SUPABASE_SERVICE_KEY not set');
    const resp = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }
    });
    checks.supabase = resp.ok ? 'ok' : `error:${resp.status}`;
    if (!resp.ok) allOk = false;
  } catch(e) {
    checks.supabase = `error:${e.message}`;
    allOk = false;
  }

  // Check env vars presence (not values)
  const required = ['STRIPE_SECRET_KEY', 'RESEND_API_KEY', 'ANTHROPIC_API_KEY'];
  const missing = required.filter(k => !process.env[k]);
  checks.env = missing.length === 0 ? 'ok' : `missing:${missing.join(',')}`;
  if (missing.length > 0) allOk = false;

  res.setHeader('Cache-Control', 'no-store');
  return res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    checks
  });
}
