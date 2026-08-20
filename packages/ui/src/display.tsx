import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export function Card({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("ui-card", className)}>
      {title ? <h2 className="ui-card__title">{title}</h2> : null}
      {children}
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="ui-stat">
      <div className="ui-stat__label">{label}</div>
      <div className="ui-stat__value">{value}</div>
      {hint ? <p className="ui-hint">{hint}</p> : null}
    </div>
  );
}

export function Badge({
  children,
  tone = "accent",
}: {
  children: ReactNode;
  tone?: "accent" | "neutral" | "danger" | "success" | "warning" | "info";
}) {
  const cls =
    tone === "accent"
      ? "ui-badge"
      : tone === "neutral"
        ? "ui-badge ui-badge--neutral"
        : tone === "danger"
          ? "ui-badge ui-badge--danger"
          : tone === "success"
            ? "ui-badge ui-badge--success"
            : tone === "info"
              ? "ui-badge ui-badge--info"
              : "ui-badge ui-badge--warning";
  return <span className={cls}>{children}</span>;
}

export function StatusBadge({
  status,
  label,
  tone,
}: {
  status?: string | null;
  label?: string;
  tone?: "accent" | "neutral" | "danger" | "success" | "warning" | "info";
}) {
  const raw = status ?? "";
  const resolvedTone =
    tone ??
    (/(PAID|COMPLETED|PUBLISHED|ACTIVE|CONNECTED|SUCCESS)/i.test(raw)
      ? "success"
      : /(OVERDUE|CANCELLED|FAILED|DANGER|EXPIRED|DENIED)/i.test(raw)
        ? "danger"
        : /(PENDING|DRAFT|WAITING|OPEN|SENT|ISSUED|PAUSED|WARNING)/i.test(raw)
          ? "warning"
          : "neutral");
  const text = label ?? raw;
  return <Badge tone={resolvedTone}>{text}</Badge>;
}

export function Section({
  title,
  description,
  actions,
  children,
  className,
  tone = "plain",
}: {
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: "plain" | "muted" | "mint";
}) {
  return (
    <section className={cn("ui-section", tone !== "plain" && `ui-section--${tone}`, className)}>
      {title || description || actions ? (
        <div className="ui-section__head">
          <div>
            {title ? <h2 className="ui-section__title">{title}</h2> : null}
            {description ? <p className="ui-section__desc">{description}</p> : null}
          </div>
          {actions ? <div className="ui-row">{actions}</div> : null}
        </div>
      ) : null}
      <div className="ui-section__body">{children}</div>
    </section>
  );
}

export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("ui-filter-bar", className)}>{children}</div>;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  "aria-label": ariaLabel = "Search",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  "aria-label"?: string;
}) {
  return (
    <input
      className="ui-input ui-search-input"
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
    />
  );
}

export function Alert({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "danger" | "success" | "warning";
}) {
  return <div className={cn("ui-alert", tone !== "neutral" && `ui-alert--${tone}`)}>{children}</div>;
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="ui-empty">
      <h2>{title}</h2>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

export function LoadingState({ children = "Loading…" }: { children?: ReactNode }) {
  return <div className="ui-loading">{children}</div>;
}

export function Skeleton({ className, style }: { className?: string; style?: HTMLAttributes<HTMLSpanElement>["style"] }) {
  return <span className={cn("ui-skeleton", className)} style={style} />;
}

export function ErrorState({
  title = "Something went wrong",
  children,
  action,
}: {
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="ui-error-state">
      <h2>{title}</h2>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

export function Avatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return <span className="ui-avatar">{initials || "?"}</span>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="ui-page-header">
      <div>
        {eyebrow ? <p className="ui-eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p className="ui-muted">{description}</p> : null}
      </div>
      {actions ? <div className="ui-row">{actions}</div> : null}
    </header>
  );
}

export function Breadcrumbs({ items }: { items: Array<{ href?: string; label: string }> }) {
  return (
    <nav className="ui-crumbs" aria-label="Breadcrumb">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`}>
          {index > 0 ? " / " : null}
          {item.href ? (
            <a className="ui-link" href={item.href}>
              {item.label}
            </a>
          ) : (
            item.label
          )}
        </span>
      ))}
    </nav>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="ui-table-wrap">
      <table className="ui-table">{children}</table>
    </div>
  );
}

export function Td({ label, children }: { label?: string; children: ReactNode }) {
  return <td data-label={label}>{children}</td>;
}

export function Tabs({
  items,
  value,
  onChange,
}: {
  items: Array<{ id: string; label: string }>;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="ui-tabs" role="tablist">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          className="ui-tab"
          data-active={item.id === value}
          aria-selected={item.id === value}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="ui-tooltip" data-tip={label}>
      {children}
    </span>
  );
}
