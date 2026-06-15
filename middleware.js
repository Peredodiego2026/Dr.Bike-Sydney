export const config = { matcher: '/' };

export default async function middleware(request) {
  const ua = request.headers.get('user-agent') || '';
  const isMobile = /Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const target = isMobile ? '/index.html' : '/landing.html';
  return fetch(new URL(target, request.url).toString());
}
