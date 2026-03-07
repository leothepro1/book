import "./globals.css";
import type { ReactNode } from "react";
import { ClerkProvider } from '@clerk/nextjs';

function AuthProvider({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === 'development') return <>{children}</>;
  return <ClerkProvider>{children}</ClerkProvider>;
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="sv">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
