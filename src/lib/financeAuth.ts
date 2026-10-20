import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';

export const FINANCE_COOKIE_NAME = 'bywell_finance_session';
export const MASTER_FINANCE_PASSWORD = process.env.FINANCE_PASSWORD || 'Whildanakbar11*';

/**
 * Check if the finance (omset) section is currently unlocked via session cookie
 */
export async function isFinanceUnlocked(): Promise<boolean> {
  const cookieStore = await cookies();
  const session = cookieStore.get(FINANCE_COOKIE_NAME);
  return !!(session && session.value === 'authenticated');
}

/**
 * Set the session cookie for finance unlock (valid for 7 days)
 */
export async function setFinanceSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(FINANCE_COOKIE_NAME, 'authenticated', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  });
}

/**
 * Clear the finance session cookie (relock the finance page)
 */
export async function clearFinanceSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(FINANCE_COOKIE_NAME);
}

/**
 * Validate the finance password against the master password or database record
 */
export async function checkFinancePassword(passwordInput: string): Promise<boolean> {
  const clean = passwordInput.trim();
  if (!clean) return false;

  // 1. Direct check with master password
  if (clean === MASTER_FINANCE_PASSWORD) {
    return true;
  }

  // 2. Fallback check with database finance_owner user if exists
  try {
    const owner = await prisma.user.findFirst({
      where: { username: 'finance_owner' },
    });
    if (owner && owner.password) {
      try {
        if (bcrypt.compareSync(clean, owner.password)) {
          return true;
        }
      } catch {
        // Fallback for plain text if any
        if (clean === owner.password) {
          return true;
        }
      }
    }
  } catch (err) {
    console.error('Error checking finance owner in DB:', err);
  }

  return false;
}
