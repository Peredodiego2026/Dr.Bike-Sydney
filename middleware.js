export const config = { matcher: '/' };

export default async function middleware(request) {
  const ua = request.headers.get('user-agent') || '';
  const isMobile = /Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const target = isMobile ? '/index.html' : '/landing.html';
  
  const response = await fetch(new URL(target, request.url).toString());
  const headers = new Headers(response.headers);
  
  // Two different documents are served at the same URL depending on the
  // User-Agent (mobile -> index.html, desktop -> landing.html). Any shared
  // cache in front of this - and Google, whose docs require it for dynamic
  // serving - has to be told the response varies by UA, or a desktop visitor
  // can be handed the mobile document out of a cache keyed only on the URL.
  headers.set('Vary', 'User-Agent');

  // Security headers at edge
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-XSS-Protection', '1; mode=block');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
