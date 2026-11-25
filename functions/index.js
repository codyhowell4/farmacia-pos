// Cloudflare Pages Function — matches ONLY the bare "/" route (Pages builds
// _routes.json from this folder, so no other request invokes a Function).
//
// The same Pages project serves several hostnames. On the main domain
// (apolofarmacia.com.mx / www) "/" is the public marketing home page
// (dist/inicio.html, built by tools/build-site.mjs). On every other host
// (app., formularios., pages.dev, …) "/" keeps serving the React staff app.
//
// Preview on any host: /?sitio=1 renders the marketing home.
const SITE_HOSTS = new Set(['apolofarmacia.com.mx', 'www.apolofarmacia.com.mx']);

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (!SITE_HOSTS.has(url.hostname) && !url.searchParams.has('sitio')) {
    return context.next();
  }
  try {
    const res = await context.env.ASSETS.fetch(new URL('/inicio', url.origin));
    if (!res.ok) return context.next();
    const headers = new Headers(res.headers);
    headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    headers.set('X-Frame-Options', 'SAMEORIGIN');
    headers.set('Permissions-Policy', 'geolocation=(), payment=(), usb=()');
    if (url.searchParams.has('sitio') && !SITE_HOSTS.has(url.hostname)) headers.set('X-Robots-Tag', 'noindex');
    return new Response(res.body, { status: 200, headers });
  } catch (err) {
    // Never take "/" down: fall back to the normal static response.
    return context.next();
  }
}
