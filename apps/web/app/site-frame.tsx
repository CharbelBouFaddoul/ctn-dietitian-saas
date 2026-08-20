"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { MarketingShell } from "@nutrition-saas/ui";

export function SiteFrame({ children }: { children: ReactNode }) {
  return <MarketingShell linkComponent={Link}>{children}</MarketingShell>;
}
