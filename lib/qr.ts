/**
 * QR Code helper for internal chemical management system.
 *
 * QR codes encode ONLY the chemical code (e.g. "CHM-001") — no URL,
 * no domain, no external link. The QR is scanned inside the app
 * after the user has logged in, and the app resolves the code
 * against the database to open the chemical detail page.
 */

/**
 * Returns the value to encode inside a QR code for a chemical.
 * This is just the chemical's code string (e.g. "CHM-001").
 */
export function getQrValue(chemical: { code: string; id: string; qr_token?: string | null }): string {
  return chemical.code;
}

/**
 * Generates a new random qr_token for a chemical.
 * Used when regenerating a QR code.
 */
export function generateQrToken(): string {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}
