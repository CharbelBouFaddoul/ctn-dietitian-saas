import type { Metadata } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Sans } from "next/font/google";
import "@nutrition-saas/ui/tokens.css";
import "@nutrition-saas/ui/ui.css";
import { Providers } from "./providers";

const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Nutrition",
  description: "Clinic management for dietitians and a simple portal for their clients.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={plex.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
