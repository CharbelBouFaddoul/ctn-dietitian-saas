"use client";

import type { ComponentType, ReactNode } from "react";
import { useState } from "react";
import { Button } from "./button";

export interface NavItem {
  href: string;
  label: string;
}

export type ShellLink = ComponentType<{
  href: string;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
  "data-active"?: boolean;
}>;

const DefaultLink: ShellLink = ({ href, className, children, onClick, ...rest }) => (
  <a href={href} className={className} onClick={onClick} {...rest}>
    {children}
  </a>
);

export function AppShell({
  theme,
  brand,
  meta,
  nav,
  pathname,
  footer,
  children,
  linkComponent: Link = DefaultLink,
  variant = "sidebar",
}: {
  theme: "admin" | "practice" | "client";
  brand: string;
  meta?: string;
  nav: NavItem[];
  pathname?: string;
  footer?: ReactNode;
  children: ReactNode;
  linkComponent?: ShellLink;
  variant?: "sidebar" | "client";
}) {
  const [open, setOpen] = useState(false);

  return (
    <div data-theme={theme} className={variant === "client" ? "ui-client-shell" : undefined}>
      <div className="ui-app__topbar">
        <strong>{brand}</strong>
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          Menu
        </Button>
      </div>
      <div className="ui-app">
        {open ? <div className="ui-drawer-backdrop" onClick={() => setOpen(false)} /> : null}
        <aside className={open ? "ui-app__sidebar is-open" : "ui-app__sidebar"}>
          <div>
            <p className="ui-eyebrow">{theme === "admin" ? "Platform" : theme === "practice" ? "Practice" : "Portal"}</p>
            <p className="ui-app__brand">{brand}</p>
            {meta ? <p className="ui-app__meta">{meta}</p> : null}
          </div>
          <nav className="ui-app__nav">
            {nav.map((item) => {
              const active =
                pathname === item.href || (item.href !== nav[0]?.href && Boolean(pathname?.startsWith(item.href)));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="ui-nav-link"
                  data-active={active}
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          {footer}
        </aside>
        <main className="ui-app__main">{children}</main>
      </div>
    </div>
  );
}

export function Sidebar({ children }: { children: ReactNode }) {
  return <aside className="ui-app__sidebar">{children}</aside>;
}
