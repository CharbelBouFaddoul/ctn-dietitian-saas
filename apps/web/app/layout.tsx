import type { Metadata } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Sans } from "next/font/google";
import "@nutrition-saas/ui/tokens.css";
import "@nutrition-saas/ui/ui.css";
import { Providers } from "./providers";

const APPEARANCE_BOOTSTRAP_SCRIPT =
  '(function(){try{var r=localStorage.getItem("dietitian.appearance");var p=r==="light"||r==="dark"||r==="system"?r:"system";var d=p==="dark"||(p!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute("data-appearance",d?"dark":"light");}catch(e){}})();';

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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className={plex.className} suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
