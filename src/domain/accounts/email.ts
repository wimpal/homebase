/** Canonicalize emails for lookup and storage. */
export function canonicalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  // Practical check — HTML type=email already constrains UX.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
