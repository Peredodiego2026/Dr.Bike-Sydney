// tests/unit/csp-and-error-reporting.test.js
//
// Puntos 1 y 20 de la auditoria.
//
// PUNTO 1 - cabeceras. El veredicto era "FUERTE": CSP completa, HSTS con
// preload, X-Frame-Options DENY, nosniff, Permissions-Policy. Solo quedaba
// endurecer: `script-src` permite 'unsafe-inline' y varios CDN de terceros.
//
// PUNTO 20 - alertas. "Sentry esta cargado. Alguien mira los errores?" Medido:
// **5 de 28 archivos de api/ reportaban**. Los otros podian fallar en produccion
// sin dejar rastro en ningun lado accionable - incluidos los tres escenarios
// que la propia auditoria nombraba.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const vercel = JSON.parse(read('vercel.json'));

const cspValue = (() => {
  for (const h of vercel.headers ?? []) {
    for (const hdr of h.headers ?? []) {
      if (hdr.key.toLowerCase() === 'content-security-policy') return hdr.value;
    }
  }
  return '';
})();

const directive = (name) => {
  const m = new RegExp(name + '\\s+([^;]+)').exec(cspValue);
  return m ? m[1].trim() : '';
};

describe('la CSP no permite hosts que nadie usa', () => {
  // Cada host permitido es una via por la que un script de terceros
  // comprometido podria ejecutar. Los que no se usan son riesgo sin beneficio.
  const DEAD = ['api.mapbox.com', 'www.gstatic.com', 'connect.facebook.net', '*.mapbox.com'];

  for (const host of DEAD) {
    it(`${host} ya no esta permitido`, () => {
      expect(cspValue).not.toContain(host);
    });
  }

  // Verificado por grep sobre *.html y *.js el 2026-09-01: cero apariciones
  // fuera de la propia cabecera. Lo unico que habia de Facebook era un <a href>
  // a la pagina, que no carga script.
  it('y de verdad no se usan en el sitio', () => {
    const surfaces = [
      'index.html',
      'landing.html',
      'admin.html',
      'mechanic.html',
      'track.html',
      'js/app.js',
      'js/admin.js',
      'js/mechanic.js',
      'js/landing-inline.js',
    ]
      .map((p) => {
        try {
          return read(p);
        } catch {
          return '';
        }
      })
      .join('');
    for (const host of ['api.mapbox.com', 'www.gstatic.com', 'connect.facebook.net']) {
      expect(surfaces, `${host} aparece en una superficie`).not.toContain(host);
    }
  });
});

describe('lo que la CSP si tiene que seguir permitiendo', () => {
  // Sacar de mas rompe la app en silencio y solo se nota cuando un cliente no
  // puede pagar. Estos estan en uso verificado.
  const NEEDED = {
    'script-src': ['js.stripe.com', 'googletagmanager.com', 'sentry-cdn.com', 'unpkg.com'],
    'connect-src': ['*.supabase.co', 'api.stripe.com', 'nominatim.openstreetmap.org'],
    'frame-src': ['js.stripe.com'],
    'img-src': ['*.tile.openstreetmap.org'],
  };
  for (const [dir, hosts] of Object.entries(NEEDED)) {
    for (const h of hosts) {
      it(`${dir} conserva ${h}`, () => {
        expect(directive(dir)).toContain(h);
      });
    }
  }
});

describe('las cabeceras duras siguen puestas', () => {
  const all = JSON.stringify(vercel.headers ?? []);
  it('object-src none, base-uri self, frame-ancestors none', () => {
    expect(cspValue).toContain("object-src 'none'");
    expect(cspValue).toContain("base-uri 'self'");
    expect(cspValue).toContain("frame-ancestors 'none'");
  });
  it('HSTS con preload', () => {
    expect(all).toMatch(/max-age=\d+.*preload/);
  });
  it('nosniff y DENY', () => {
    expect(all).toContain('nosniff');
    expect(all).toContain('DENY');
  });
});

describe("'unsafe-inline' sigue, y por que", () => {
  // Documentado en vez de arreglado, que es lo que la auditoria permitia.
  //
  // Un nonce hay que generarlo POR PETICION y meterlo en el HTML que se sirve.
  // Este sitio es HTML estatico en Vercel: no hay render por peticion donde
  // ponerlo. Y los hashes no alcanzan: js/consent.js CREA elementos <script> en
  // tiempo de ejecucion cuando el visitante acepta las cookies, y su contenido
  // no se conoce al construir.
  //
  // Sacarlo hoy romperia el banner de cookies, que es lo que impide que los
  // analytics arranquen sin permiso. Cambiar una proteccion real por una
  // teorica seria un mal negocio.
  it('sigue permitido, deliberadamente', () => {
    expect(directive('script-src')).toContain("'unsafe-inline'");
  });

  // vercel.json es JSON y no admite comentarios, asi que el motivo vive en un
  // archivo aparte. Que exista y explique las dos alternativas descartadas es
  // parte del cierre del punto 1: la auditoria permitia documentar por que no
  // se puede, pero no dejarlo sin explicacion.
  it('y el motivo esta escrito en un lugar que alguien va a encontrar', () => {
    const doc = read('docs/SECURITY-HEADERS.md');
    expect(doc).toContain('unsafe-inline');
    expect(doc).toMatch(/[Nn]onces/);
    expect(doc).toMatch(/[Hh]ashes/);
    expect(doc).toContain('consent.js');
  });
});

describe('un error en un endpoint no se pierde', () => {
  // Los tres escenarios que la auditoria nombraba caen justo aca: Stripe caido
  // de madrugada, Twilio rechazando los SMS del mecanico, y una migracion sin
  // correr que hace fallar una escritura en silencio.
  const CRITICAL = [
    'auth.js',
    'chat.js',
    'create-payment-session.js',
    'stripe-webhook.js',
    'send-message.js',
    'send-email.js',
    'send-cron.js',
    'send-push.js',
    'send-invoice.js',
    'send-reminders.js',
    'create-subscription.js',
    'subscribe-newsletter.js',
  ];

  for (const f of CRITICAL) {
    it(`api/${f} reporta sus errores`, () => {
      expect(read('api/' + f)).toContain('withSentry(handler');
    });
  }

  // El que mas importa de los tres: un mecanico que no se entera de su trabajo
  // es una cita perdida con un cliente real.
  it('el envio de SMS y WhatsApp esta cubierto', () => {
    expect(read('api/send-message.js')).toMatch(/withSentry\(handler, 'send-message'\)/);
  });

  // Si esto se cae, no corren los recordatorios, ni el backup, ni el reembolso
  // automatico de pagos huerfanos - y nadie se entera.
  it('los trabajos programados tambien', () => {
    expect(read('api/send-cron.js')).toMatch(/withSentry\(handler, 'send-cron'\)/);
  });

  it('ningun endpoint publico quedo sin envolver', () => {
    const dir = new URL('../../api/', import.meta.url);
    const missing = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.js') && !f.startsWith('_'))
      .filter((f) => !read('api/' + f).includes('withSentry'));
    expect(missing).toEqual([]);
  });
});
