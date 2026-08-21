"use client";

import type { ReactNode } from "react";
import { SiteFrame } from "../site-frame";
import { RequireGuest } from "../../lib/require-guest";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <RequireGuest>
      <SiteFrame>{children}</SiteFrame>
    </RequireGuest>
  );
}
