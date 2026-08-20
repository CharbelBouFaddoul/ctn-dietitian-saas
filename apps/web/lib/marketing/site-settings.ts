export type BrandDisplayMode = "LOGO" | "TEXT" | "LOGO_AND_TEXT";

export interface SiteNavItem {
  href: string;
  label: string;
  visible: boolean;
  order: number;
}

export interface SiteFooterLink {
  href: string;
  label: string;
}

export interface SiteFooterGroup {
  title: string;
  links: SiteFooterLink[];
}

export interface SiteSocialLink {
  label: string;
  href: string;
}

export interface SiteSettings {
  brandText: string;
  logoUrl: string | null;
  brandDisplay: BrandDisplayMode;
  navItems: SiteNavItem[];
  ctaText: string;
  ctaHref: string;
  ctaVisible: boolean;
  registrationEnabled: boolean;
  emailNotificationsEnabled?: boolean;
  dietitianSignInLabel: string;
  patientSignInLabel: string;
  footerDescription: string;
  footerGroups: SiteFooterGroup[];
  copyrightText: string;
  socialLinks: SiteSocialLink[];
  contactEmail: string | null;
  contactPhone: string | null;
  contactAddress: string | null;
  contactHours: string | null;
}

export const FALLBACK_SITE_SETTINGS: SiteSettings = {
  brandText: "Nutrition",
  logoUrl: null,
  brandDisplay: "TEXT",
  navItems: [
    { href: "/how-it-works", label: "How it works", visible: true, order: 0 },
    { href: "/features", label: "Features", visible: true, order: 1 },
    { href: "/faq", label: "FAQ", visible: true, order: 2 },
    { href: "/contact", label: "Contact", visible: true, order: 3 },
  ],
  ctaText: "Get Started",
  ctaHref: "/auth/dietitian/register",
  ctaVisible: true,
  registrationEnabled: false,
  emailNotificationsEnabled: false,
  dietitianSignInLabel: "Sign in as Dietitian",
  patientSignInLabel: "Sign in as Patient",
  footerDescription:
    "A nutrition practice platform for dietitians and the clients they care for — meal plans, tracking, messaging, and practice tools in one place.",
  footerGroups: [
    {
      title: "Product",
      links: [
        { href: "/how-it-works", label: "How it works" },
        { href: "/features", label: "Features" },
        { href: "/faq", label: "FAQ" },
        { href: "/contact", label: "Contact" },
      ],
    },
    {
      title: "For Dietitians",
      links: [
        { href: "/auth/dietitian/login", label: "Dietitian sign in" },
        { href: "/auth/dietitian/register", label: "Create practice account" },
      ],
    },
    {
      title: "For Patients",
      links: [
        { href: "/auth/client/login", label: "Patient sign in" },
        { href: "/how-it-works", label: "Join your dietitian" },
      ],
    },
  ],
  copyrightText: "© Nutrition. All rights reserved.",
  socialLinks: [],
  contactEmail: null,
  contactPhone: null,
  contactAddress: null,
  contactHours: null,
};
