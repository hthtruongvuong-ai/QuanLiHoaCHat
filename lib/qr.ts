/**
 * Resolves the correct base URL for QR codes and external links.
 *
 * Priority:
 * 1. NEXT_PUBLIC_APP_URL env var (production URL like https://myapp.bolt.host)
 * 2. window.location.origin (fallback for same-origin scanning)
 *
 * This ensures QR codes always point to the production deployment,
 * not the temporary WebContainer preview URL.
 */
export function getAppUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl && envUrl.trim().length > 0) {
    return envUrl.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return '';
}

/**
 * Builds a QR code URL that points to the /qr/[token] route.
 * Uses the production app URL so the QR works when scanned
 * from any device, even after the WebContainer preview is gone.
 */
export function buildQrUrl(token: string): string {
  const base = getAppUrl();
  return `${base}/qr/${token}`;
}
