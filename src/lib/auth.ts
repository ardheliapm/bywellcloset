import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';

export interface UserSession {
  id: string;
  username: string;
  name: string;
  role: string;
}

const COOKIE_NAME = 'bywell_session';

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function comparePassword(password: string, hashed: string): boolean {
  return bcrypt.compareSync(password, hashed);
}

export async function setSessionCookie(user: UserSession) {
  const cookieStore = await cookies();
  const sessionData = JSON.stringify(user);

  cookieStore.set(COOKIE_NAME, sessionData, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 hari
    path: '/',
  });
}

export async function getSession(): Promise<UserSession | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(COOKIE_NAME);

    if (!sessionCookie || !sessionCookie.value) {
      return null;
    }

    return JSON.parse(sessionCookie.value) as UserSession;
  } catch (error) {
    return null;
  }
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
