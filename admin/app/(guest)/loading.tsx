/**
 * Guest portal root loading boundary.
 * Returns null — individual routes define their own loading states.
 * Prevents the full-screen lottie overlay from blocking /search and /p/[token].
 */
export default function Loading() {
  return null;
}
