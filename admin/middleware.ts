import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher([
  '/',
  '/p/(.*)',
  '/check-in(.*)',
  '/check-out(.*)',
  '/preview/(.*)',
  '/api/webhooks/(.*)',
  ...(process.env.NODE_ENV === 'development' ? ['/(.*)',] : []),
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

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
