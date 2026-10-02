import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const pinSession = request.cookies.get('bywell_pin_session');
  const pathname = request.nextUrl.pathname;

  // Allow static files, Next.js internal files, and API routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // If user is accessing /pin or /login
  if (pathname === '/pin' || pathname === '/login') {
    if (pinSession && pinSession.value) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // If user is not authenticated with PIN, redirect to /pin
  if (!pinSession || !pinSession.value) {
    return NextResponse.redirect(new URL('/pin', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
