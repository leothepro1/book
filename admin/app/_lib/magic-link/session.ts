import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { env } from "@/app/_lib/env";

export interface GuestSession {
  tenantId: string;
  email: string;
  authenticatedAt: number; // unix timestamp ms
  guestAccountId?: string; // set by OTP auth, absent for legacy magic-link sessions
}

interface SessionData {
  guest?: GuestSession;
}

const SESSION_OPTIONS = {
  password: "",  // set lazily below
  cookieName: "guest_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
};

function getSessionOptions() {
  return {
    ...SESSION_OPTIONS,
    password: env.GUEST_SESSION_SECRET,
  };
}

export async function getGuestSession(): Promise<GuestSession | null> {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  return session.guest ?? null;
}

export async function setGuestSession(data: GuestSession): Promise<void> {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  session.guest = data;
  await session.save();
}

export async function clearGuestSession(): Promise<void> {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  session.guest = undefined;
  await session.save();
}
