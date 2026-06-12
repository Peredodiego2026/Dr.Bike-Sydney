export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const checks = {};

  // Supabase ping
  try {
    const r = await fetch(
      `${process.env.SUPABASE_URL || 'https://tgpipbloisahufaywhqb.supabase.co'}/rest/v1/`,
      { headers: { apikey: process.env.SUPABASE_KEY || '' } }
    );
    checks.supabase = r.ok ? 'ok' : `error:${r.status}`;
  } catch {
    checks.supabase = 'unreachable';
  }

  const allOk = Object.values(checks).every(v => v === 'ok');

  return res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    checks,
    ts: new Date().toISOString(),
  });
}
