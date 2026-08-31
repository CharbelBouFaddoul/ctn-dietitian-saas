"use client";

import type { ReactNode } from "react";
import { SiteFrame } from "../site-frame";

export default function LegalLayout({ children }: { children: ReactNode }) {
  return <SiteFrame>{children}</SiteFrame>;
}
