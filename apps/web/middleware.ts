import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

type PublicSiteSettings = {
  plansPageEnabled?: boolean;
  dietitianRegistrationEnabled?: boolean;
  patientRegistrationEnabled?: boolean;
  registrationEnabled?: boolean;
};

async function loadPublicSiteSettings(): Promise<PublicSiteSettings | null> {
  try {
    const base =
      process.env.INTERNAL_API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      "http://localhost:3001";
    const res = await fetch(`${base}/api/v1/public/site-settings`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    return (await res.json()) as PublicSiteSettings;
  } catch {
    return null;
  }
}

/**
 * Hard-block deactivated public routes so direct URLs cannot render them.
 * Fails closed when site-settings cannot be loaded.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPlansRoute = pathname === "/plans" || pathname === "/pricing";
  const isDietitianRegister =
    pathname === "/auth/dietitian/register" || pathname === "/auth/register";
  const isPatientRegister = pathname === "/auth/client/register";

  if (!isPlansRoute && !isDietitianRegister && !isPatientRegister) {
    return NextResponse.next();
  }

  const settings = await loadPublicSiteSettings();
  const plansEnabled = settings?.plansPageEnabled === true;
  const dietitianRegistrationEnabled =
    settings?.dietitianRegistrationEnabled === true ||
    (settings?.dietitianRegistrationEnabled === undefined && settings?.registrationEnabled === true);
  const patientRegistrationEnabled =
    settings?.patientRegistrationEnabled === true ||
    (settings?.patientRegistrationEnabled === undefined && settings?.registrationEnabled === true);

  if (isPlansRoute) {
    if (!plansEnabled) {
      return NextResponse.redirect(new URL("/contact", request.url));
    }
    if (pathname === "/pricing") {
      return NextResponse.redirect(new URL("/plans", request.url));
    }
    return NextResponse.next();
  }

  if (isDietitianRegister && !dietitianRegistrationEnabled) {
    return NextResponse.redirect(new URL("/auth/dietitian/login", request.url));
  }

  if (isPatientRegister && !patientRegistrationEnabled) {
    return NextResponse.redirect(new URL("/auth/client/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/plans",
    "/pricing",
    "/auth/register",
    "/auth/dietitian/register",
    "/auth/client/register",
  ],
};
