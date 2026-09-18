"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { isAdminLoginPath } from "../../lib/admin-path";
import { AdminShell } from "./admin-shell";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isAdminLoginPath(pathname)) {
    return children;
  }
  return <AdminShell>{children}</AdminShell>;
}
