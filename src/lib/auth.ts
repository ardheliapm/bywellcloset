import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { prisma } from './prisma';
import {
  PIN_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  verifySessionToken,
} from './session';

export function hashPin(pin: string): string {
  return bcrypt.hashSync(pin, 10);
}

export function comparePin(pin: string, hashed: string): boolean {
  try {
    return bcrypt.compareSync(pin.trim(), hashed);
  } catch {
    return false;
  }
}

/** Pasang cookie sesi (30 hari). Mengembalikan false jika AUTH_SECRET belum diatur. */
export async function setPinSessionCookie(): Promise<boolean> {
  const token = await createSessionToken();
  if (!token) return false;

  const cookieStore = await cookies();
  cookieStore.set(PIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: '/',
  });
  return true;
}

export async function clearPinSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(PIN_COOKIE_NAME);
}

export async function hasPinSession(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(PIN_COOKIE_NAME)?.value);
}

/**
 * Ambil hash PIN admin dari database.
 * Jika belum ada data admin, dibuat dari environment variable INITIAL_PIN
 * (harus 6 angka). Tanpa INITIAL_PIN, tidak ada PIN bawaan: login ditolak.
 */
export async function getStoredHashedPin(): Promise<string | null> {
  try {
    const adminUser = await prisma.user.findFirst({
      where: { username: 'admin' },
    });
    if (adminUser) return adminUser.password;

    const initialPin = process.env.INITIAL_PIN?.trim();
    if (initialPin && /^\d{6}$/.test(initialPin)) {
      const created = await prisma.user.create({
        data: {
          username: 'admin',
          name: 'Admin Bywell Closet',
          password: hashPin(initialPin),
          role: 'ADMIN',
        },
      });
      return created.password;
    }

    return null;
  } catch (error) {
    console.error('Error fetching stored PIN:', error);
    return null;
  }
}
