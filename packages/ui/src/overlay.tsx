"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useState } from "react";
import { Button } from "./button";

export function Dialog({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const headingId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <div className="ui-dialog-backdrop" onClick={onClose} />
      <div className="ui-dialog" role="dialog" aria-modal="true" aria-labelledby={headingId}>
        <h2 id={headingId} className="ui-card__title">
          {title}
        </h2>
        {children}
      </div>
    </>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  danger = false,
  pending = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} title={title} onClose={onCancel}>
      {description ? <p className="ui-muted">{description}</p> : null}
      <div className="ui-row" style={{ marginTop: 16, justifyContent: "flex-end" }}>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant={danger ? "danger" : "primary"} disabled={pending} onClick={onConfirm}>
          {pending ? "Working…" : confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}

export function Dropdown({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ui-dropdown">
      <Button variant="secondary" size="sm" onClick={() => setOpen((value) => !value)}>
        {label}
      </Button>
      {open ? (
        <div className="ui-dropdown__menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function DropdownItem({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button type="button" className="ui-dropdown__item" onClick={onClick}>
      {children}
    </button>
  );
}
