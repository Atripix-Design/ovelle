import type { D1Database, SendEmail } from '@cloudflare/workers-types';

export interface DownloadEmailEnv { APP_ENV: string; DB: D1Database; EMAIL?: SendEmail; DOWNLOAD_EMAIL_FROM?: string }
const json = (body: object, status = 200, headers: Record<string, string> = {}) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
const digest = async (value: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(n => n.toString(16).padStart(2, '0')).join('');

/** Public download addresses have their own syntax and HTTP error contract.
 * Do not substitute Stage 0 contact or strict JSON parsing during cleanup. */
async function readRecipient(request: Request): Promise<string | Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, { Allow: 'POST' });
  const origin = request.headers.get('Origin');
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') return json({ error: 'Request not allowed' }, 403);
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'Expected JSON' }, 415);
  const reader = request.body?.getReader();
  if (!reader) return json({ error: 'Email address is required' }, 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > 1024) {
      await reader.cancel();
      return json({ error: 'Request too large' }, 413);
    }
    chunks.push(part.value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  let data: unknown;
  try { data = JSON.parse(new TextDecoder().decode(body)); } catch { return json({ error: 'Invalid request' }, 400); }
  const email = data && typeof data === 'object' && 'email' in data && typeof data.email === 'string' ? data.email.trim() : '';
  if (email.length > 254 || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(email) || /[\r\n]/.test(email)) return json({ error: 'Enter a valid email address.' }, 400);
  return email;
}

/** Reservations are not refunded on provider failure or denial by the other
 * counter. Preserve this conservative quota policy and its existing key format. */
async function reserveDelivery(db: D1Database, ip: string, email: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const limits = [
    { key: `ip:${await digest(ip)}:${Math.floor(now / 3600)}`, max: 5 },
    { key: `recipient:${await digest(email.toLowerCase())}:${Math.floor(now / 600)}`, max: 3 },
  ];
  const reservations = await db.batch(limits.map(limit => db.prepare('INSERT INTO download_email_limits (key, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1 WHERE count < ? RETURNING count').bind(limit.key, now + 3600, limit.max)));
  if (reservations.some(result => !result.results.length)) return false;
  await db.prepare('DELETE FROM download_email_limits WHERE expires_at < ?').bind(now).run();
  return true;
}

async function deliverLink(mailer: SendEmail, sender: string, email: string): Promise<void> {
  const result = await mailer.send({
    from: { email: sender, name: 'Ovelle' },
    to: email,
    subject: 'Your Ovelle download link',
    text: 'Get Ovelle on your computer.\n\nOpen https://dev.ovelle.org/#download on your Mac or Windows computer to choose your download.\n\nYou requested this link on the Ovelle website. No account or subscription was created.',
    html: '<h1>Get Ovelle on your computer.</h1><p>Open this link on your Mac or Windows computer to choose your download.</p><p><a href="https://dev.ovelle.org/#download">Download Ovelle</a></p><p>You requested this link on the Ovelle website. No account or subscription was created.</p>',
  });
  if (!result?.messageId) throw new Error('Missing email acknowledgement');
}

export async function sendDownloadEmail(request: Request, env: DownloadEmailEnv): Promise<Response> {
  const email = await readRecipient(request);
  if (email instanceof Response) return email;
  if (env.APP_ENV !== 'development' || !env.EMAIL || env.DOWNLOAD_EMAIL_FROM !== 'downloads@dev.mail.ovelle.org') return json({ error: 'Email delivery is unavailable. Please try again.' }, 503);
  try {
    if (!await reserveDelivery(env.DB, request.headers.get('CF-Connecting-IP') || 'local', email)) {
      return json({ error: 'Please wait before requesting another link.' }, 429, { 'Retry-After': '600' });
    }
    await deliverLink(env.EMAIL, env.DOWNLOAD_EMAIL_FROM, email);
    return json({ sent: true });
  } catch { return json({ error: 'We couldn’t send the link. Please try again.' }, 503); }
}
