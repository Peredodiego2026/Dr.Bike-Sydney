export const config = { matcher: '/' };

export default async function middleware(request) {
  const ua = request.headers.get('user-agent') || '';
  const isMobile = /Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const target = isMobile ? '/index.html' : '/landing.html';
  
  const response = await fetch(new URL(target, request.url).toString());
  const headers = new Headers(response.headers);
  
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
