// Sesi login berbasis cookie yang ditandatangani (HMAC-SHA256).
//
// File ini sengaja HANYA memakai Web Crypto (tanpa Prisma/bcrypt) supaya bisa
// dipakai di middleware maupun di server action.
//
// Butuh environment variable AUTH_SECRET (minimal 16 karakter, acak & rahasia)
// di Vercel. Tanpa AUTH_SECRET di production, semua sesi dianggap tidak valid
// (login ditutup, bukan dibuka).

export const PIN_COOKIE_NAME = 'bywell_pin_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 hari

const TOKEN_VERSION = 'v1';
const encoder = new TextEncoder();

function getSecret(): string | null {
  const secret = process.env.AUTH_SECRET;
  if (secret && secret.length >= 16) return secret;
  // Hanya untuk pengembangan lokal. Di production wajib pakai AUTH_SECRET.
  if (process.env.NODE_ENV !== 'production') return 'dev-only-secret-do-not-use-in-production';
  return null;
}

export function isAuthConfigured(): boolean {
  return getSecret() !== null;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return toHex(signature);
}

// Perbandingan waktu-konstan supaya tanda tangan tidak bisa ditebak lewat selisih waktu.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Buat token sesi baru yang berlaku 30 hari. Mengembalikan null jika AUTH_SECRET belum diatur. */
export async function createSessionToken(): Promise<string | null> {
  const secret = getSecret();
  if (!secret) return null;
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  const payload = `${TOKEN_VERSION}.${expiresAt}`;
  return `${payload}.${await sign(payload, secret)}`;
}

/** Cek tanda tangan dan masa berlaku token sesi. */
export async function verifySessionToken(token: string | null | undefined): Promise<boolean> {
  if (!token) return false;
  const secret = getSecret();
  if (!secret) return false;

  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) return false;

  const expiresAt = Number(parts[1]);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now() / 1000) return false;

  const expected = await sign(`${parts[0]}.${parts[1]}`, secret);
  return safeEqual(expected, parts[2]);
}
