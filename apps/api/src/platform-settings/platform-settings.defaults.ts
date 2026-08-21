export const PLATFORM_SETTINGS_SINGLETON_ID = "00000000-0000-4000-8000-000000000001";

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

export interface PlatformSettingsPayload {
  brandText: string;
  logoUrl: string | null;
  brandDisplay: BrandDisplayMode;
  navItems: SiteNavItem[];
  ctaText: string;
  ctaHref: string;
  ctaVisible: boolean;
  /** Self-serve dietitian (clinic) registration. */
  dietitianRegistrationEnabled: boolean;
  /** Self-serve patient registration. */
  patientRegistrationEnabled: boolean;
  /**
   * True when either dietitian or patient self-registration is open.
   * Computed for backward-compatible consumers.
   */
  registrationEnabled: boolean;
  /** When false, /plans redirects to contact and Get Started goes to /contact. */
  plansPageEnabled: boolean;
  /** Product notification emails (invoice, automation). Auth emails always send. */
  emailNotificationsEnabled: boolean;
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

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettingsPayload = {
  brandText: "Nutrition",
  logoUrl: null,
  brandDisplay: "TEXT",
  navItems: [
    { href: "/how-it-works", label: "How it works", visible: true, order: 0 },
    { href: "/features", label: "Features", visible: true, order: 1 },
    { href: "/plans", label: "Plans", visible: true, order: 2 },
    { href: "/faq", label: "FAQ", visible: true, order: 3 },
    { href: "/contact", label: "Contact", visible: true, order: 4 },
  ],
  ctaText: "Get Started",
  ctaHref: "/plans",
  ctaVisible: true,
  dietitianRegistrationEnabled: false,
  patientRegistrationEnabled: false,
  registrationEnabled: false,
  plansPageEnabled: true,
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
        { href: "/plans", label: "Plans" },
        { href: "/faq", label: "FAQ" },
        { href: "/contact", label: "Contact" },
      ],
    },
    {
      title: "For Dietitians",
      links: [
        { href: "/auth/dietitian/login", label: "Dietitian sign in" },
        { href: "/plans", label: "View plans" },
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
