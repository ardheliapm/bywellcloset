import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';
import {
  FINANCE_COOKIE_NAME,
  createSessionToken,
  getSessionMaxAge,
  safeEqual,
  verifySessionToken,
} from './session';

export { FINANCE_COOKIE_NAME };

/**
 * Password utama halaman keuangan, diambil dari environment variable
 * FINANCE_PASSWORD (Vercel). Tidak ada password bawaan di kode: jika belum
 * diatur (atau kurang dari 8 karakter), password utama dianggap tidak ada.
 */
function getMasterFinancePassword(): string | null {
  const password = process.env.FINANCE_PASSWORD;
  return password && password.length >= 8 ? password : null;
}

/**
 * Cek apakah halaman keuangan sedang terbuka lewat cookie sesi yang valid
 * (ditandatangani, scope finance, masa berlaku 7 hari).
 */
export async function isFinanceUnlocked(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(FINANCE_COOKIE_NAME)?.value, 'finance');
}

/**
 * Pasang cookie sesi keuangan (7 hari). Mengembalikan false jika AUTH_SECRET belum diatur.
 */
export async function setFinanceSessionCookie(): Promise<boolean> {
  const token = await createSessionToken('finance');
  if (!token) return false;

  const cookieStore = await cookies();
  cookieStore.set(FINANCE_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: getSessionMaxAge('finance'),
    path: '/',
  });
  return true;
}

/**
 * Hapus cookie sesi keuangan (kunci lagi halaman keuangan)
 */
export async function clearFinanceSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(FINANCE_COOKIE_NAME);
}

/**
 * Validasi password keuangan terhadap FINANCE_PASSWORD atau data finance_owner di database
 */
export async function checkFinancePassword(passwordInput: string): Promise<boolean> {
  const clean = passwordInput.trim();
  if (!clean) return false;

  // 1. Password utama dari environment variable
  const master = getMasterFinancePassword();
  if (master && safeEqual(clean, master)) {
    return true;
  }

  // 2. Cadangan: pengguna finance_owner di database (hash bcrypt)
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
        return false;
      }
    }
  } catch (err) {
    console.error('Error checking finance owner in DB:', err);
  }

  return false;
}
