"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Alert, PageHeader } from "@nutrition-saas/ui";

export type AdminCrumb = { href?: string; label: string };

export function AdminPage({
  eyebrow,
  title,
  description,
  actions,
  crumbs,
  error,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  crumbs?: AdminCrumb[];
  error?: string | null;
  children?: ReactNode;
}) {
  return (
    <section className="ui-admin-page">
      {crumbs && crumbs.length > 0 ? (
        <nav className="ui-admin-crumbs" aria-label="Breadcrumb">
          {crumbs.map((item, index) => (
            <span key={`${item.label}-${index}`}>
              {index > 0 ? <span className="ui-admin-crumbs__sep">/</span> : null}
              {item.href ? (
                <Link href={item.href} className="ui-link">
                  {item.label}
                </Link>
              ) : (
                <span>{item.label}</span>
              )}
            </span>
          ))}
        </nav>
      ) : null}
      <PageHeader eyebrow={eyebrow} title={title} description={description} actions={actions} />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {children}
    </section>
  );
}
