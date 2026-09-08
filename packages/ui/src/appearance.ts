export const APPEARANCE_STORAGE_KEY = "dietitian.appearance";
export const APPEARANCE_CHANGE_EVENT = "dietitian-appearance-change";

export type AppearancePreference = "light" | "dark" | "system";
export type AppearanceResolved = "light" | "dark";

export const APPEARANCE_PREFERENCES: AppearancePreference[] = ["light", "dark", "system"];

export function parseAppearancePreference(value: string | null | undefined): AppearancePreference {
  if (value === "light" || value === "dark" || value === "system") return value;
  return "system";
}

export function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveAppearance(preference: AppearancePreference): AppearanceResolved {
  if (preference === "light" || preference === "dark") return preference;
  return systemPrefersDark() ? "dark" : "light";
}

export function applyAppearance(resolved: AppearanceResolved): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-appearance", resolved);
}

export function readAppearancePreference(): AppearancePreference {
  if (typeof window === "undefined") return "system";
  try {
    return parseAppearancePreference(window.localStorage.getItem(APPEARANCE_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function writeAppearancePreference(preference: AppearancePreference): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, preference);
  } catch {
    /* private mode */
  }
  applyAppearance(resolveAppearance(preference));
  window.dispatchEvent(new CustomEvent(APPEARANCE_CHANGE_EVENT, { detail: preference }));
}

export function subscribeSystemAppearance(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => undefined;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const listener = () => onChange();
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

/** Inline script for the document head — runs before paint to avoid a light flash. */
export const APPEARANCE_BOOTSTRAP_SCRIPT = `(function(){try{var r=localStorage.getItem("${APPEARANCE_STORAGE_KEY}");var p=r==="light"||r==="dark"||r==="system"?r:"system";var d=p==="dark"||(p!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute("data-appearance",d?"dark":"light");}catch(e){}})();`;
