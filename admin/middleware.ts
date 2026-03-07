import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const isPublicRoute = createRouteMatcher([
  '/',
  '/p/(.*)',
  '/check-in(.*)',
  '/check-out(.*)',
  '/preview/(.*)',
  '/api/webhooks/(.*)',
]);

// I dev: skippa Clerk helt — ingen handshake, ingen redirect
const middleware = process.env.NODE_ENV === 'development'
  ? (_request: NextRequest) => NextResponse.next()
  : clerkMiddleware(async (auth, request) => {
      if (!isPublicRoute(request)) {
        await auth.protect();
      }
    });

export default middleware;

export const config = {
  matcher: [
    '/(admin)(.*)',
    '/(api(?!/webhooks))(.*)',
    '/dashboard(.*)',
    '/design(.*)',
    '/home(.*)',
    '/sign-in(.*)',
    '/sign-up(.*)',
  ],
};
