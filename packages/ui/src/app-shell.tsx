"use client";

import type { ComponentType, ReactNode } from "react";
import { useEffect, useState } from "react";
import { Button } from "./button";
import { cn } from "./cn";

export interface NavItem {
  href: string;
  label: string;
  icon?: ReactNode;
  /** Prefer exact pathname match (e.g. Dashboard at `/orgs/:id`). */
  exact?: boolean;
  /** Optional section key when using flat `nav` (legacy). */
  section?: string;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export type ShellLink = ComponentType<{
  href: string;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
  "data-active"?: boolean;
  title?: string;
}>;

const DefaultLink: ShellLink = ({ href, className, children, onClick, title, ...rest }) => (
  <a href={href} className={className} onClick={onClick} title={title} {...rest}>
    {children}
  </a>
);

function isActive(pathname: string | undefined, item: NavItem, rootHref?: string): boolean {
  if (!pathname) return false;
  if (item.exact) return pathname === item.href;
  if (rootHref && item.href === rootHref) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function AppShell({
  theme,
  brand,
  meta,
  nav,
  navSections,
  pathname,
  footer,
  children,
  linkComponent: Link = DefaultLink,
  variant = "sidebar",
  collapsible = false,
}: {
  theme: "admin" | "practice" | "client";
  brand: string;
  meta?: string;
  /** Flat nav (Admin/Patient). Still supported. */
  nav?: NavItem[];
  /** Grouped nav (Practice). Takes precedence when provided. */
  navSections?: NavSection[];
  pathname?: string;
  footer?: ReactNode;
  children: ReactNode;
  linkComponent?: ShellLink;
  variant?: "sidebar" | "client";
  /** Desktop icon-rail collapse (practice). */
  collapsible?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const sections: NavSection[] =
    navSections && navSections.length > 0
      ? navSections
      : nav
        ? [{ label: "", items: nav }]
        : [];

  const rootHref = sections[0]?.items[0]?.href;
  const showCollapse = collapsible && variant === "sidebar" && theme === "practice";
  const isCollapsed = Boolean(collapsed && showCollapse);

  return (
    <div
      data-theme={theme}
      className={cn(variant === "client" && "ui-client-shell", isCollapsed && "ui-app--collapsed")}
    >
      <div className="ui-app__topbar">
        <div className="ui-app__topbar-brand">
          <strong>{brand}</strong>
          {meta ? <span className="ui-muted">{meta}</span> : null}
        </div>
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)} aria-label="Open navigation">
          Menu
        </Button>
      </div>
      <div className="ui-app">
        {open ? (
          <button
            type="button"
            className="ui-drawer-backdrop"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          />
        ) : null}
        <aside className={cn("ui-app__sidebar", open && "is-open", isCollapsed && "is-collapsed")}>
          <div className="ui-app__sidebar-head">
            <div className="ui-app__identity">
              <p className="ui-eyebrow">
                {theme === "admin" ? "Platform" : theme === "practice" ? "Practice" : "My care"}
              </p>
              <p className="ui-app__brand">{brand}</p>
              {meta ? <p className="ui-app__meta">{meta}</p> : null}
            </div>
            <button
              type="button"
              className="ui-app__drawer-close"
              aria-label="Close navigation"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>

          <nav className="ui-app__nav" aria-label="Primary">
            {sections.map((section) => (
              <div key={section.label || "main"} className="ui-app__nav-section">
                {section.label ? <p className="ui-app__nav-label">{section.label}</p> : null}
                {section.items.map((item) => {
                  const active = isActive(pathname, item, rootHref);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn("ui-nav-link", isCollapsed && "ui-nav-link--collapsed")}
                      data-active={active}
                      onClick={() => setOpen(false)}
                      title={isCollapsed ? item.label : undefined}
                    >
                      {item.icon ? <span className="ui-nav-link__icon">{item.icon}</span> : null}
                      <span className="ui-nav-link__label">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="ui-app__sidebar-foot">
            {showCollapse ? (
              <button
                type="button"
                className="ui-app__collapse-btn"
                onClick={() => setCollapsed((value) => !value)}
                aria-pressed={collapsed}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {collapsed ? "»" : "«"}
                <span className="ui-app__collapse-text">{collapsed ? "Expand" : "Collapse"}</span>
              </button>
            ) : null}
            {footer ? <div className="ui-app__footer">{footer}</div> : null}
          </div>
        </aside>
        <main className="ui-app__main">{children}</main>
      </div>
    </div>
  );
}

export function Sidebar({ children }: { children: ReactNode }) {
  return <aside className="ui-app__sidebar">{children}</aside>;
}
