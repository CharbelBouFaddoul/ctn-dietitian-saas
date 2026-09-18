const FALLBACK_ADMIN_BASE_PATH = "/ns-console";

const RESERVED_SLUGS = new Set([
  "api",
  "auth",
  "client",
  "contact",
  "login",
  "plans",
  "practice",
  "pricing",
  "register",
]);

export function normalizeAdminBasePath(raw?: string | null): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return FALLBACK_ADMIN_BASE_PATH;
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const noTrail = withSlash.replace(/\/+$/, "") || FALLBACK_ADMIN_BASE_PATH;
  if (!/^\/[A-Za-z0-9][A-Za-z0-9_-]{2,62}$/.test(noTrail)) {
    return FALLBACK_ADMIN_BASE_PATH;
  }
  const slug = noTrail.slice(1).toLowerCase();
  if (RESERVED_SLUGS.has(slug)) return FALLBACK_ADMIN_BASE_PATH;
  return noTrail;
}

export function getAdminBasePath(): string {
  return normalizeAdminBasePath(process.env.NEXT_PUBLIC_ADMIN_BASE_PATH || process.env.ADMIN_BASE_PATH);
}

export function adminPath(path = ""): string {
  const base = getAdminBasePath();
  if (!path || path === "/") return base;
  const queryIndex = path.indexOf("?");
  const pathname = queryIndex === -1 ? path : path.slice(0, queryIndex);
  const query = queryIndex === -1 ? "" : path.slice(queryIndex);
  const suffix = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${base}${suffix}${query}`;
}

export function isAdminLoginPath(pathname: string): boolean {
  return pathname === adminPath("/login") || pathname === "/admin/login";
}

export function publicAdminPathname(pathname: string): string {
  const base = getAdminBasePath();
  if (base === "/admin") return pathname;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return `${base}${pathname.slice("/admin".length)}`;
  }
  return pathname;
}

export function isHiddenPublicAdminPath(pathname: string): boolean {
  const base = getAdminBasePath();
  return base !== "/admin" && (pathname === "/admin" || pathname.startsWith("/admin/"));
}

export function rewriteAdminPathname(pathname: string): string | null {
  const base = getAdminBasePath();
  if (base === "/admin") return null;
  if (pathname === base) return "/admin";
  if (pathname.startsWith(`${base}/`)) {
    return `/admin${pathname.slice(base.length)}`;
  }
  return null;
}
