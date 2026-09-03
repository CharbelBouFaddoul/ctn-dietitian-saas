"use client";

import type { ReactNode } from "react";
import { Tabs } from "@nutrition-saas/ui";

export function AdminDetail({
  tabs,
  tab,
  onTabChange,
  meta,
  children,
}: {
  tabs: Array<{ id: string; label: string }>;
  tab: string;
  onTabChange: (id: string) => void;
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={meta ? "ui-admin-detail" : "ui-admin-detail ui-admin-detail--plain"}>
      {meta ? <aside className="ui-admin-detail__meta">{meta}</aside> : null}
      <div className="ui-admin-detail__main">
        <Tabs items={tabs} value={tab} onChange={onTabChange} variant="line" />
        <div className="ui-admin-detail__body">{children}</div>
      </div>
    </div>
  );
}

export function AdminMetaList({ rows }: { rows: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="ui-admin-meta">
      {rows.map((row) => (
        <div key={row.label} className="ui-admin-meta__row">
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
