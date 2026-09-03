"use client";

import type { ComponentType, ReactNode } from "react";
import { useId, useState } from "react";
import { Button } from "./button";
import { cn } from "./cn";

export type BrandDisplayMode = "LOGO" | "TEXT" | "LOGO_AND_TEXT";

export interface MarketingNavItem {
  href: string;
  label: string;
  visible?: boolean;
  order?: number;
}

export interface MarketingFooterLink {
  href: string;
  label: string;
}

export interface MarketingFooterGroup {
  title: string;
  links: MarketingFooterLink[];
}

export interface MarketingSocialLink {
  label: string;
  href: string;
}

export interface MarketingSiteSettings {
  brandText: string;
  logoUrl: string | null;
  brandDisplay: BrandDisplayMode;
  navItems: MarketingNavItem[];
  ctaText: string;
  ctaHref: string;
  ctaVisible: boolean;
  dietitianRegistrationEnabled?: boolean;
  patientRegistrationEnabled?: boolean;
  registrationEnabled?: boolean;
  plansPageEnabled?: boolean;
  trialSignupEnabled?: boolean;
  onlineCheckoutEnabled?: boolean;
  dietitianSignInLabel: string;
  patientSignInLabel: string;
  footerDescription: string;
  footerGroups: MarketingFooterGroup[];
  copyrightText: string;
  socialLinks: MarketingSocialLink[];
  contactEmail: string | null;
  contactPhone: string | null;
  contactAddress: string | null;
  contactHours: string | null;
}

function registrationLinkAllowed(
  href: string,
  dietitianRegistrationEnabled: boolean,
  patientRegistrationEnabled: boolean,
): boolean {
  if (href.includes("/auth/dietitian/register") || href === "/auth/register") {
    return dietitianRegistrationEnabled;
  }
  if (href.includes("/auth/client/register")) {
    return patientRegistrationEnabled;
  }
  if (href.includes("/register")) {
    return dietitianRegistrationEnabled || patientRegistrationEnabled;
  }
  return true;
}

const DEFAULT_SETTINGS: MarketingSiteSettings = {
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
    {
      title: "Legal",
      links: [
        { href: "/privacy", label: "Privacy policy" },
        { href: "/terms", label: "Terms of use" },
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

type MktLink = ComponentType<{
  href: string;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
}>;

const DefaultLink: MktLink = ({ href, className, children, onClick }) => (
  <a href={href} className={className} onClick={onClick}>
    {children}
  </a>
);

function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function BrandMark({
  settings,
  Link,
  onNavigate,
}: {
  settings: MarketingSiteSettings;
  Link: MktLink;
  onNavigate?: () => void;
}) {
  return (
    <Link href="/" className="ui-mkt__brand" onClick={onNavigate}>
      <span className="ui-mkt__brand-text">{settings.brandText}</span>
    </Link>
  );
}

export function MarketingShell({
  children,
  linkComponent: Link = DefaultLink,
  settings = DEFAULT_SETTINGS,
  pathname = "",
}: {
  children: ReactNode;
  linkComponent?: MktLink;
  settings?: MarketingSiteSettings;
  pathname?: string;
}) {
  const [open, setOpen] = useState(false);
  const navId = useId();
  const dietitianRegistrationEnabled =
    settings.dietitianRegistrationEnabled ?? settings.registrationEnabled ?? false;
  const patientRegistrationEnabled =
    settings.patientRegistrationEnabled ?? settings.registrationEnabled ?? false;
  const plansPageEnabled = settings.plansPageEnabled !== false;
  let resolvedCtaHref = settings.ctaHref;
  if (
    (resolvedCtaHref.includes("/auth/dietitian/register") || resolvedCtaHref === "/auth/register") &&
    !dietitianRegistrationEnabled
  ) {
    resolvedCtaHref = plansPageEnabled ? "/plans" : "/contact";
  } else if (resolvedCtaHref.includes("/auth/client/register") && !patientRegistrationEnabled) {
    resolvedCtaHref = plansPageEnabled ? "/plans" : "/contact";
  } else if (resolvedCtaHref.includes("/register") && !dietitianRegistrationEnabled && !patientRegistrationEnabled) {
    resolvedCtaHref = plansPageEnabled ? "/plans" : "/contact";
  }
  if (!plansPageEnabled && (resolvedCtaHref.includes("/plans") || resolvedCtaHref.includes("/pricing"))) {
    resolvedCtaHref = "/contact";
  }
  const ctaVisible = settings.ctaVisible;
  const footerGroups = settings.footerGroups.map((group) => ({
    ...group,
    links: group.links
      .filter((link) => registrationLinkAllowed(link.href, dietitianRegistrationEnabled, patientRegistrationEnabled))
      .filter((link) => plansPageEnabled || (!link.href.includes("/plans") && !link.href.includes("/pricing"))),
  }));
  const navItems = [...settings.navItems]
    .filter((item) => item.visible !== false)
    .filter((item) => registrationLinkAllowed(item.href, dietitianRegistrationEnabled, patientRegistrationEnabled))
    .filter((item) => plansPageEnabled || (!item.href.includes("/plans") && !item.href.includes("/pricing")))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  function close() {
    setOpen(false);
  }

  return (
    <div className="ui-mkt" data-theme="marketing">
      <header className="ui-mkt__header">
        <div className="ui-mkt__nav">
          <BrandMark settings={settings} Link={Link} onNavigate={close} />

          <nav id={navId} className={open ? "ui-mkt__links is-open" : "ui-mkt__links"} aria-label="Primary">
            {navItems.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn("ui-mkt__nav-link", isNavActive(pathname, link.href) && "is-active")}
                onClick={close}
              >
                {link.label}
              </Link>
            ))}
            <div className="ui-mkt__links-auth">
              <Link href="/auth/dietitian/login" className="ui-mkt__auth-link" onClick={close}>
                {settings.dietitianSignInLabel}
              </Link>
              <Link href="/auth/client/login" className="ui-mkt__auth-link" onClick={close}>
                {settings.patientSignInLabel}
              </Link>
              {ctaVisible ? (
                <Link href={resolvedCtaHref} className="ui-btn ui-btn--primary ui-btn--sm" onClick={close}>
                  {settings.ctaText}
                </Link>
              ) : null}
            </div>
          </nav>

          <div className="ui-mkt__actions">
            <Link href="/auth/dietitian/login" className="ui-mkt__auth-link ui-mkt__auth-desktop">
              {settings.dietitianSignInLabel}
            </Link>
            <Link href="/auth/client/login" className="ui-mkt__auth-link ui-mkt__auth-desktop">
              {settings.patientSignInLabel}
            </Link>
            {ctaVisible ? (
              <Link href={resolvedCtaHref} className="ui-btn ui-btn--primary ui-btn--sm ui-mkt__auth-desktop">
                {settings.ctaText}
              </Link>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              className="ui-mkt-menu"
              aria-expanded={open}
              aria-controls={navId}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? "Close" : "Menu"}
            </Button>
          </div>
        </div>
        {open ? <button type="button" className="ui-mkt__backdrop" aria-label="Close menu" onClick={close} /> : null}
      </header>

      <main>{children}</main>

      <footer className="ui-mkt__footer">
        <div className="ui-mkt__footer-inner">
          <div className="ui-mkt__footer-brand">
            <BrandMark settings={settings} Link={Link} />
            <p>{settings.footerDescription}</p>
            {(settings.contactEmail || settings.contactPhone || settings.contactAddress) && (
              <div className="ui-mkt__footer-contact">
                {settings.contactEmail ? (
                  <a href={`mailto:${settings.contactEmail}`} className="ui-mkt__footer-link">
                    {settings.contactEmail}
                  </a>
                ) : null}
                {settings.contactPhone ? <span>{settings.contactPhone}</span> : null}
                {settings.contactAddress ? <span>{settings.contactAddress}</span> : null}
              </div>
            )}
            {settings.socialLinks.length > 0 ? (
              <div className="ui-mkt__footer-social">
                {settings.socialLinks.map((social) => (
                  <a
                    key={social.href}
                    href={social.href}
                    className="ui-mkt__footer-link"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {social.label}
                  </a>
                ))}
              </div>
            ) : null}
          </div>

          <div className="ui-mkt__footer-groups">
            {footerGroups.map((group) => (
              <div key={group.title} className="ui-mkt__footer-group">
                <h3>{group.title}</h3>
                <ul>
                  {group.links.map((link) => (
                    <li key={`${group.title}-${link.href}`}>
                      <Link href={link.href}>{link.label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="ui-mkt__footer-bottom">
          <span>{settings.copyrightText}</span>
          <span className="ui-mkt__footer-legal">
            <Link href="/privacy" className="ui-mkt__footer-link">
              Privacy
            </Link>
            <Link href="/terms" className="ui-mkt__footer-link">
              Terms
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}

export type AuthLayoutAudience = "admin" | "dietitian" | "client";

export function AuthLayout({
  title,
  description,
  children,
  footer,
  eyebrow = "Nutrition",
  audience = "dietitian",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  eyebrow?: string;
  audience?: AuthLayoutAudience;
  backHref?: string;
  backLabel?: string;
}) {
  const framed = audience !== "admin";
  return (
    <div
      className={cn(
        "ui-auth",
        "ui-auth--simple",
        framed && "ui-auth--framed",
        audience === "client" && "ui-auth--client",
        audience === "dietitian" && "ui-auth--dietitian",
        audience === "admin" && "ui-auth--admin",
      )}
      data-theme="marketing"
    >
      <section className="ui-auth__panel">
        <p className="ui-eyebrow">{eyebrow}</p>
        <h1 className="ui-auth__title">{title}</h1>
        {description ? <p className="ui-muted">{description}</p> : null}
        {children}
        {footer}
      </section>
    </div>
  );
}
