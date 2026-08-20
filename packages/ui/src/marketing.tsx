"use client";

import type { ComponentType, ReactNode } from "react";
import { useState } from "react";
import { Button } from "./button";

const LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
];

type MktLink = ComponentType<{ href: string; className?: string; children: ReactNode; onClick?: () => void }>;

const DefaultLink: MktLink = ({ href, className, children, onClick }) => (
  <a href={href} className={className} onClick={onClick}>
    {children}
  </a>
);

export function MarketingShell({
  children,
  linkComponent: Link = DefaultLink,
}: {
  children: ReactNode;
  linkComponent?: MktLink;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ui-mkt" data-theme="marketing">
      <header className="ui-mkt__nav" style={{ position: "relative" }}>
        <Link href="/" className="ui-app__brand" onClick={() => setOpen(false)}>
          Nutrition
        </Link>
        <nav className={open ? "ui-mkt__links is-open" : "ui-mkt__links"}>
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} onClick={() => setOpen(false)}>
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="ui-row">
          <Button variant="secondary" size="sm" className="ui-mkt-menu" onClick={() => setOpen((value) => !value)}>
            Menu
          </Button>
          <Link href="/auth/login" className="ui-btn ui-btn--ghost ui-btn--sm">
            Sign In
          </Link>
          <Link href="/auth/register" className="ui-btn ui-btn--primary ui-btn--sm">
            Get Started
          </Link>
        </div>
      </header>
      {children}
      <footer className="ui-mkt__footer">
        <span>Nutrition for dietitians and the clients they care for.</span>
        <span>
          <Link href="/contact" className="ui-link">
            Contact
          </Link>
        </span>
      </footer>
    </div>
  );
}

export function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="ui-auth" data-theme="marketing">
      <section className="ui-card ui-auth__card">
        <p className="ui-eyebrow">Nutrition</p>
        <h1 style={{ margin: "0.35rem 0 0.75rem", fontSize: "1.75rem" }}>{title}</h1>
        {description ? <p className="ui-muted">{description}</p> : null}
        {children}
        {footer}
      </section>
    </main>
  );
}
