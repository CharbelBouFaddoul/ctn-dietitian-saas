/**
 * Base URL for server-side fetches to the API.
 * Prefer INTERNAL_API_URL in Docker (e.g. http://api:3001) so SSR does not
 * hit the browser-facing localhost URL from inside the web container.
 */
export function serverApiBaseUrl(): string {
  return (
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3001"
  );
}

export function serverApiUrl(path: string): string {
  return `${serverApiBaseUrl()}${path}`;
}
