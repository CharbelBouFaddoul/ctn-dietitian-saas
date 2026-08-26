import { FALLBACK_SITE_SETTINGS } from "./site-settings";
import { serverApiUrl } from "../server-api";

/** Whether the public Plans page should be reachable. Fails closed. */
export async function isPlansPageEnabled(): Promise<boolean> {
  try {
    const res = await fetch(serverApiUrl("/api/v1/public/site-settings"), {
      cache: "no-store",
    });
    if (!res.ok) {
      return FALLBACK_SITE_SETTINGS.plansPageEnabled === true;
    }
    const data = (await res.json()) as { plansPageEnabled?: boolean };
    return data.plansPageEnabled === true;
  } catch {
    return FALLBACK_SITE_SETTINGS.plansPageEnabled === true;
  }
}
