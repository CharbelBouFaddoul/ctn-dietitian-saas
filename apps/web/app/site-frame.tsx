"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MarketingShell } from "@nutrition-saas/ui";
import { API_URL } from "../lib/api";
import { FALLBACK_SITE_SETTINGS, type SiteSettings } from "../lib/marketing/site-settings";

export function SiteFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const [settings, setSettings] = useState<SiteSettings>(FALLBACK_SITE_SETTINGS);

  useEffect(() => {
    void fetch(`${API_URL}/api/v1/public/site-settings`)
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as SiteSettings;
        setSettings({ ...FALLBACK_SITE_SETTINGS, ...data });
      })
      .catch(() => {
        /* keep fallback */
      });
  }, []);

  return (
    <MarketingShell linkComponent={Link} settings={settings} pathname={pathname}>
      {children}
    </MarketingShell>
  );
}
