"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "./button";

let dialogLockCount = 0;
let dialogLockSnapshot: {
  htmlOverflow: string;
  bodyOverflow: string;
  position: string;
  top: string;
  width: string;
  paddingRight: string;
  scrollY: number;
} | null = null;

function lockPageScroll() {
  if (dialogLockCount === 0) {
    const html = document.documentElement;
    dialogLockSnapshot = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
      paddingRight: document.body.style.paddingRight,
      scrollY: window.scrollY,
    };
    const scrollbarGap = window.innerWidth - html.clientWidth;
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${dialogLockSnapshot.scrollY}px`;
    document.body.style.width = "100%";
    if (scrollbarGap > 0) document.body.style.paddingRight = `${scrollbarGap}px`;
  }
  dialogLockCount += 1;
  return dialogLockCount;
}

function unlockPageScroll() {
  dialogLockCount = Math.max(0, dialogLockCount - 1);
  if (dialogLockCount > 0 || !dialogLockSnapshot) return;
  const html = document.documentElement;
  const snap = dialogLockSnapshot;
  html.style.overflow = snap.htmlOverflow;
  document.body.style.overflow = snap.bodyOverflow;
  document.body.style.position = snap.position;
  document.body.style.top = snap.top;
  document.body.style.width = snap.width;
  document.body.style.paddingRight = snap.paddingRight;
  window.scrollTo(0, snap.scrollY);
  dialogLockSnapshot = null;
}

export function Dialog({
  open,
  title,
  children,
  onClose,
  className,
  elevated = false,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  elevated?: boolean;
}) {
  const headingId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const depth = lockPageScroll();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && depth === dialogLockCount) onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      unlockPageScroll();
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!open) return null;
  return (
    <>
      <div
        className={["ui-dialog-backdrop", elevated ? "is-elevated" : ""].filter(Boolean).join(" ")}
        onClick={onClose}
      />
      <div
        className={["ui-dialog", elevated ? "is-elevated" : "", className].filter(Boolean).join(" ")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
      >
        <div className="ui-dialog__head">
          <h2 id={headingId} className="ui-dialog__title">
            {title}
          </h2>
          <button type="button" className="ui-dialog__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="ui-dialog__body">{children}</div>
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
    <Dialog open={open} title={title} onClose={onCancel} elevated>
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
