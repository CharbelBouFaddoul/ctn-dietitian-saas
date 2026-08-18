import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@nutrition-saas/ui/tokens.css";

export const metadata: Metadata = {
  title: "Nutrition SaaS",
  description: "Nutrition practice management",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
