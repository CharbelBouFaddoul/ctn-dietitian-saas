"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MarketingShell } from "@nutrition-saas/ui";
import { API_URL } from "../lib/api";
import { FALLBACK_SITE_SETTINGS, type SiteSettings } from "../lib/marketing/site-settings";

function withMarketingDefaults(settings: SiteSettings): SiteSettings {
  const plansPageEnabled = settings.plansPageEnabled === true;

  let navItems = settings.navItems;
  const hasPlans = navItems.some((item) => item.href === "/plans");
  if (plansPageEnabled && !hasPlans) {
    navItems = [
      ...navItems,
      { href: "/plans", label: "Plans", visible: true, order: 2 },
    ].map((item, index) => ({ ...item, order: item.order ?? index }));
  }
  if (!plansPageEnabled) {
    navItems = navItems.filter((item) => item.href !== "/plans" && item.href !== "/pricing");
  }

  let footerGroups = settings.footerGroups.map((group) => {
    let links = group.links;
    if (!plansPageEnabled) {
      links = links.filter((link) => link.href !== "/plans" && link.href !== "/pricing");
    } else if (group.title === "Product" && !links.some((link) => link.href === "/plans")) {
      links = [...links.slice(0, 2), { href: "/plans", label: "Plans" }, ...links.slice(2)];
    }
    return { ...group, links };
  });
  const hasPrivacy = footerGroups.some((group) => group.links.some((link) => link.href === "/privacy"));
  const hasTerms = footerGroups.some((group) => group.links.some((link) => link.href === "/terms"));
  if (!hasPrivacy || !hasTerms) {
    const extra = [
      ...(!hasPrivacy ? [{ href: "/privacy", label: "Privacy policy" }] : []),
      ...(!hasTerms ? [{ href: "/terms", label: "Terms of use" }] : []),
    ];
    const legalIndex = footerGroups.findIndex((group) => group.title === "Legal");
    if (legalIndex >= 0) {
      footerGroups = footerGroups.map((group, index) =>
        index === legalIndex ? { ...group, links: [...group.links, ...extra] } : group,
      );
    } else {
      footerGroups = [...footerGroups, { title: "Legal", links: extra }];
    }
  }

  let ctaHref = settings.ctaHref || (plansPageEnabled ? "/plans" : "/contact");
  const dietitianRegistrationEnabled =
    settings.dietitianRegistrationEnabled ?? settings.registrationEnabled;
  const patientRegistrationEnabled =
    settings.patientRegistrationEnabled ?? settings.registrationEnabled;
  if (
    (ctaHref.includes("/auth/dietitian/register") || ctaHref === "/auth/register") &&
    !dietitianRegistrationEnabled
  ) {
    ctaHref = plansPageEnabled ? "/plans" : "/contact";
  } else if (ctaHref.includes("/auth/client/register") && !patientRegistrationEnabled) {
    ctaHref = plansPageEnabled ? "/plans" : "/contact";
  } else if (ctaHref.includes("/register") && !dietitianRegistrationEnabled && !patientRegistrationEnabled) {
    ctaHref = plansPageEnabled ? "/plans" : "/contact";
  }
  if (!plansPageEnabled && (ctaHref.includes("/plans") || ctaHref.includes("/pricing"))) {
    ctaHref = "/contact";
  }

  return {
    ...settings,
    plansPageEnabled,
    navItems,
    footerGroups,
    ctaHref,
    footerDescription: settings.footerDescription.replaceAll(" — ", ": ").replaceAll("—", ", "),
  };
}

export function SiteFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const [settings, setSettings] = useState<SiteSettings>(withMarketingDefaults(FALLBACK_SITE_SETTINGS));

  useEffect(() => {
    void fetch(`${API_URL}/api/v1/public/site-settings`)
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as SiteSettings;
        setSettings(withMarketingDefaults({ ...FALLBACK_SITE_SETTINGS, ...data }));
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
