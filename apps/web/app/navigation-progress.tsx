"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Top progress bar for App Router navigations.
 * Starts on internal link clicks; completes when pathname/search changes.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [active, setActive] = useState(false);
  const [done, setDone] = useState(false);
  const routeKey = `${pathname}?${searchParams?.toString() ?? ""}`;
  const prevRoute = useRef(routeKey);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      try {
        const url = new URL(href, window.location.origin);
        if (url.origin !== window.location.origin) return;
        if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      } catch {
        return;
      }
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setDone(false);
      setActive(true);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (prevRoute.current === routeKey) return;
    prevRoute.current = routeKey;
    if (!active) return;
    setDone(true);
    hideTimer.current = setTimeout(() => {
      setActive(false);
      setDone(false);
    }, 160);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [routeKey, active]);

  if (!active && !done) return null;

  return (
    <div
      className={done ? "ui-nav-progress is-done" : "ui-nav-progress is-active"}
      role="progressbar"
      aria-hidden="true"
    />
  );
}
