import { clerkMiddleware } from '@clerk/nextjs/server';

export default clerkMiddleware({
  // Public routes - gäster behöver inte logga in
  publicRoutes: [
    '/',
    '/(guest)(.*)',
    '/p/(.*)',
    '/check-in',
    '/check-out',
    '/preview/(.*)',
    '/api/webhooks/(.*)', // Webhooks måste vara publika
  ],
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
