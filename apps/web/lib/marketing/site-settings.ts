import { LEGAL_FOOTER_GROUP } from "./legal";

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
  dietitianRegistrationEnabled: boolean;
  patientRegistrationEnabled: boolean;
  /** True when either audience can self-register. */
  registrationEnabled: boolean;
  plansPageEnabled?: boolean;
  emailNotificationsEnabled?: boolean;
  emailVerificationRequired?: boolean;
  onlineCheckoutEnabled?: boolean;
  trialSignupEnabled?: boolean;
  trialDurationDays?: number;
  trialPlanSlug?: string;
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
    { href: "/plans", label: "Plans", visible: true, order: 2 },
    { href: "/faq", label: "FAQ", visible: true, order: 3 },
    { href: "/contact", label: "Contact", visible: true, order: 4 },
  ],
  ctaText: "Start free trial",
  ctaHref: "/auth/dietitian/register",
  ctaVisible: true,
  dietitianRegistrationEnabled: true,
  patientRegistrationEnabled: true,
  registrationEnabled: true,
  plansPageEnabled: true,
  emailNotificationsEnabled: false,
  emailVerificationRequired: false,
  onlineCheckoutEnabled: false,
  trialSignupEnabled: true,
  trialDurationDays: 14,
  dietitianSignInLabel: "Sign in as Dietitian",
  patientSignInLabel: "Sign in as Patient",
  footerDescription:
    "Clinic software for dietitians who are done running care in spreadsheets and chat. Charts, plans, tracking, and practice tools in one place.",
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
        { href: "/auth/dietitian/register", label: "Start free trial" },
      ],
    },
    {
      title: "For Patients",
      links: [
        { href: "/auth/client/login", label: "Patient sign in" },
        { href: "/how-it-works", label: "Join your dietitian" },
      ],
    },
    {
      title: LEGAL_FOOTER_GROUP.title,
      links: [...LEGAL_FOOTER_GROUP.links],
    },
  ],
  copyrightText: "© Nutrition. All rights reserved.",
  socialLinks: [],
  contactEmail: null,
  contactPhone: null,
  contactAddress: null,
  contactHours: null,
};
