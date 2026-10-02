import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { prisma } from './prisma';

const PIN_COOKIE_NAME = 'bywell_pin_session';
const DEFAULT_PIN = '123456';

export function hashPin(pin: string): string {
  return bcrypt.hashSync(pin, 10);
}

export function comparePin(pin: string, hashed: string): boolean {
  return bcrypt.compareSync(pin, hashed);
}

export async function setPinSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(PIN_COOKIE_NAME, 'authenticated', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 hari
    path: '/',
  });
}

export async function clearPinSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(PIN_COOKIE_NAME);
}

export async function hasPinSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const session = cookieStore.get(PIN_COOKIE_NAME);
  return !!(session && session.value);
}

/**
 * Get the current active hashed PIN from database.
 * If no admin record exists, create default admin with PIN '123456'.
 */
export async function getStoredHashedPin(): Promise<string> {
  try {
    let adminUser = await prisma.user.findFirst({
      where: { username: 'admin' },
    });

    if (!adminUser) {
      const defaultHash = hashPin(DEFAULT_PIN);
      adminUser = await prisma.user.create({
        data: {
          username: 'admin',
          name: 'Admin Bywell Closet',
          password: defaultHash,
          role: 'ADMIN',
        },
      });
    }

    return adminUser.password;
  } catch (error) {
    console.error('Error fetching stored PIN, using fallback hash:', error);
    return hashPin(DEFAULT_PIN);
  }
}
