export const config = { matcher: '/' };

export default async function middleware(request) {
  const ua = request.headers.get('user-agent') || '';
  // Keep this list identical to the guard at the top of index.html, which
  // bounces non-mobile agents to /landing.html. They disagreed until
  // 2026-07-28: this one was missing iPad and webOS, so an iPad asking for /
  // was handed the desktop marketing page while an Android tablet got the app.
  // Two lists deciding the same thing have to be read together - if you edit
  // one, edit the other.
  //
  // What this cannot catch, by design of the platform: an iPhone with "Request
  // Desktop Website" on, and any iPadOS 13+ tablet in its default mode, both
  // send a Macintosh user-agent. They are indistinguishable from a real Mac
  // here and will get /landing.html. Only the browser can tell (viewport plus
  // a coarse pointer), and a redirect from that side would fight index.html's
  // guard above - see docs/PENDIENTES.md 9.5 before adding one.
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
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
