import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { PIN_COOKIE_NAME, verifySessionToken } from '@/lib/session';

// Semua halaman (dan server action, yang dikirim lewat URL halaman) wajib punya
// sesi PIN yang valid, kecuali halaman /pin itu sendiri.
export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isLoggedIn = await verifySessionToken(request.cookies.get(PIN_COOKIE_NAME)?.value);

  // /login adalah alamat lama, arahkan ke tujuan yang benar
  if (pathname === '/login') {
    return NextResponse.redirect(new URL(isLoggedIn ? '/' : '/pin', request.url));
  }

  if (pathname === '/pin') {
    // Sudah login: tidak perlu lihat halaman PIN lagi
    if (isLoggedIn) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    return NextResponse.redirect(new URL('/pin', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
