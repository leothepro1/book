"use server";

import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

/**
 * Kräver att användaren är inloggad via Clerk.
 * Redirectar till sign-in om inte autentiserad.
 */
export async function requireAuth() {
  const user = await currentUser();
  
  if (!user) {
    redirect('/sign-in');
  }
  
  return user;
}

/**
 * Hämtar current user's Clerk ID.
 * Används för att koppla till User model i databasen.
 */
export async function getCurrentUserId(): Promise<string> {
  const user = await requireAuth();
  return user.id;
}
