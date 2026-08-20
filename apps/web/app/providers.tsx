"use client";

import type { ReactNode } from "react";
import { Suspense } from "react";
import { ToastProvider } from "@nutrition-saas/ui";
import { NavigationProgress } from "./navigation-progress";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
      {children}
    </ToastProvider>
  );
}
