import "./globals.css";
import type { ReactNode } from "react";
import { ClerkProvider } from '@clerk/nextjs';
import Script from "next/script";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";

const IS_DEV = process.env.NODE_ENV === "development";

// In dev, Clerk middleware is bypassed (see middleware.ts) and auth is mocked
// via app/(admin)/_lib/auth/devAuth.ts. Skip ClerkProvider here so Clerk JS
// never loads in dev — no handshake, no warnings, no session expectations.
function AuthProvider({ children }: { children: ReactNode }) {
  if (IS_DEV) return <>{children}</>;
  return <ClerkProvider>{children}</ClerkProvider>;
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <html lang="sv" className={`${GeistSans.variable} ${GeistMono.variable}`}>
        <head>
          <link
            rel="stylesheet"
            href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
          />
          <link
            rel="stylesheet"
            href="https://api.mapbox.com/mapbox-gl-js/v3.12.0/mapbox-gl.css"
          />
          <link rel="preload" href="/animations/loading.lottie" as="fetch" crossOrigin="anonymous" />
        </head>
        <body>
          {children}
          <Script
            src="https://unpkg.com/@lottiefiles/dotlottie-wc@0.7.1/dist/dotlottie-wc.js"
            type="module"
            strategy="beforeInteractive"
          />
        </body>
      </html>
    </AuthProvider>
  );
}
