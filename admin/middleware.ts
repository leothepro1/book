import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher([
  '/',
  '/p/(.*)',
  '/check-in(.*)',
  '/check-out(.*)',
  '/preview/(.*)',
  '/api/webhooks/(.*)',
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Only run middleware on admin routes, skip guest portal entirely
    '/(admin)(.*)',
    '/(api(?!/webhooks))(.*)',
    '/dashboard(.*)',
    '/design(.*)',
    '/home(.*)',
    '/sign-in(.*)',
    '/sign-up(.*)',
  ],
};
