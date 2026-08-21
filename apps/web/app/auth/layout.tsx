import type { ReactNode } from "react";
import { SiteFrame } from "../site-frame";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <SiteFrame>{children}</SiteFrame>;
}
